import { RedirectRequest, ResponseStatus } from './Messages';
import { JSONUtils } from './JSONUtils';
import { State } from './State';
import { UrlRpcEncoder } from './UrlRpcEncoder';

export {State, ResponseStatus} from './State';

export type CommandHandler = (state: State, ...args: any[]) => any;

export class RpcServer {

    private static _ok(state: State, result: any) {
        state.reply(ResponseStatus.OK, result);
    }

    private static _error(state: State, error: Error) {
        state.reply(ResponseStatus.ERROR, error);
    }

    private readonly _allowedOrigins: string[];
    private readonly _responseHandlers: Map<string, CommandHandler>;
    private readonly _receiveListener: (message: MessageEvent) => any;
    private _clientTimeout = 0;

    constructor(allowedOrigins: string|string[]) {
        this._allowedOrigins = typeof allowedOrigins === 'string' ? [allowedOrigins] : allowedOrigins;
        this._responseHandlers = new Map();
        this._responseHandlers.set('ping', () => {
            return 'pong';
        });
        this._receiveListener = this._receive.bind(this);
    }

    public onRequest(command: string, fn: CommandHandler) {
        this._responseHandlers.set(command, fn);
    }

    public init(onClientTimeout?: () => void) {
        window.addEventListener('message', this._receiveListener);
        if (onClientTimeout) {
            this._clientTimeout = window.setTimeout(() => { onClientTimeout(); }, 1000);
        }
        this._receiveRedirect();
    }

    public close() {
        window.removeEventListener('message', this._receiveListener);
    }

    private _receiveRedirect() {
        // Stop executing, because if this property exists the client's rejectOnBack should be triggered
        if (history.state && history.state.rpcBackRejectionId) return;

        // Check for a request in the URL (also removes params)
        const urlRequest = UrlRpcEncoder.receiveRedirectCommand(window.location);
        if (urlRequest) {
            this._receive(urlRequest);
            return;
        }

        // Check for a stored request referenced by a URL 'id' parameter
        const searchParams = new URLSearchParams(window.location.search);
        if (searchParams.has(UrlRpcEncoder.URL_SEARCHPARAM_NAME)) {
            const storedRequest = window.sessionStorage.getItem(
                `request-${searchParams.get(UrlRpcEncoder.URL_SEARCHPARAM_NAME)}`,
            );
            if (storedRequest) {
                this._receive(JSONUtils.parse(storedRequest), false);
            }
        }
    }

    private _receive(message: MessageEvent|RedirectRequest, persistMessage = true) {
        let state: State|null = null;
        try {
            state = new State(message);

            // Cannot reply to a message that has no source window or return URL
            if (!('source' in message) && !('returnURL' in message)) return;

            // Ignore messages without a command
            if (!('command' in state.data)) {
                return;
            }

            if (this._allowedOrigins.indexOf('*') < 0 && this._allowedOrigins.indexOf(message.origin) < 0) {
                throw new Error('Unauthorized');
            }

            const args = message.data.args && Array.isArray(message.data.args) ? message.data.args : [];

            // Test if request calls a valid handler with the correct number of arguments
            if (!this._responseHandlers.has(state.data.command)) {
                throw new Error(`Unknown command: ${state.data.command}`);
            }
            const requestedMethod = this._responseHandlers.get(state.data.command)!;
            // Do not include state argument
            if (Math.max(requestedMethod.length - 1, 0) < args.length) {
                throw new Error(`Too many arguments passed: ${message}`);
            }

            console.debug('RpcServer ACCEPT', state.data);
            window.clearTimeout(this._clientTimeout);

            if (persistMessage) {
                sessionStorage.setItem(`request-${state.data.id}`, JSONUtils.stringify(state.toRequestObject()));
            }

            const url = new URL(window.location.href);
            url.searchParams.set(UrlRpcEncoder.URL_SEARCHPARAM_NAME, state.data.id.toString());
            window.history.replaceState(history.state, '', url.href);

            // Call method
            const result = requestedMethod(state, ...args);

            // If a value !== undefined is returned, we take care of the reply, otherwise we assume the handler to do
            // the reply when appropriate. If the result is a promise, await it first. Also check for promise polyfills
            // in case native Promise is not available or has been overwritten by a polyfill.
            if (result instanceof Promise
                || (result && result.constructor && result.constructor.name === 'Promise')) {
                (result as Promise<any>)
                    .then((finalResult) => {
                        if (finalResult !== undefined) {
                            RpcServer._ok(state!, finalResult);
                        }
                    })
                    .catch((error) => RpcServer._error(state!, error));
            } else if (result !== undefined) {
                RpcServer._ok(state, result);
            }
        } catch (error) {
            if (state) {
                RpcServer._error(state, error);
            }
        }
    }
}

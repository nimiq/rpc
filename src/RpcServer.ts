import {RedirectRequest, ResponseStatus} from './Messages';
import {State} from './State';
import {UrlRpcEncoder} from './UrlRpcEncoder';

export {State, ResponseStatus} from './State';

export type CommandHandler = (state: State, ...args: any[]) => any;

export class RpcServer {

    public static _ok(state: State, result: any) {
        state.reply(ResponseStatus.OK, result);
    }

    public static _error(state: State, error: Error) {
        state.reply(ResponseStatus.ERROR,
            error.message
                ? { message: error.message, stack: error.stack }
                : { message: error });
    }
    private readonly _allowedOrigin: string;
    private readonly _responseHandlers: Map<string, CommandHandler>;
    private readonly _receiveListener: (message: MessageEvent) => any;

    constructor(allowedOrigin: string) {
        this._allowedOrigin = allowedOrigin;
        this._responseHandlers = new Map();
        this._responseHandlers.set('ping', () => 'pong');
        this._receiveListener = this._receive.bind(this);
    }

    public onRequest(command: string, fn: CommandHandler) {
        this._responseHandlers.set(command, fn);
    }

    public init() {
        window.addEventListener('message', this._receiveListener);
        this._receiveRedirect();
    }

    public close() {
        window.removeEventListener('message', this._receiveListener);
    }

    private _receiveRedirect() {
        const message = UrlRpcEncoder.receiveRedirectCommand(window.location);
        if (message) {
            this._receive(message);
        }
    }

    private _receive(message: MessageEvent|RedirectRequest) {
        let state: State|null = null;
        try {
            state = new State(message);

            // Cannot reply to a message that has no source window or return URL
            if (!('source' in message) && !('returnURL' in message)) return;

            // Ignore messages without a command
            if (!('command' in state.data)) {
                return;
            }

            if (this._allowedOrigin !== '*' && message.origin !== this._allowedOrigin) {
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

            // Call method
            const result = requestedMethod(state, ...args);

            // If a value is returned, we take care of the reply,
            // otherwise we assume the handler to do the reply when appropriate.
            if (result instanceof Promise) {
                result
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

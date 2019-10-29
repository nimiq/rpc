import { JSONUtils } from './JSONUtils';
import { RandomUtils } from './RandomUtils';
import { ResponseMessage, ResponseStatus, ResponseMethod } from './Messages';
import { RequestIdStorage } from './RequestIdStorage';
import { UrlRpcEncoder } from './UrlRpcEncoder';
import { ObjectType } from './ObjectType';

export interface ResponseHandler {
    resolve: (result: any, id?: number, state?: ObjectType | null) => any;
    reject: (error: any, id?: number, state?: ObjectType | null) => any;
}

export abstract class RpcClient {
    protected readonly _allowedOrigin: string;
    protected readonly _waitingRequests: RequestIdStorage;
    protected readonly _responseHandlers: Map<string | number, ResponseHandler>;
    protected readonly _preserveRequests: boolean;

    protected constructor(allowedOrigin: string, storeState: boolean = false) {
        this._allowedOrigin = allowedOrigin;
        this._waitingRequests = new RequestIdStorage(storeState);
        this._responseHandlers = new Map();
        this._preserveRequests = false;
    }

    public onResponse(command: string,
                      resolve: (result: any, id?: number, state?: ObjectType | null) => any,
                      reject: (error: any, id?: number, state?: ObjectType | null) => any) {
        this._responseHandlers.set(command, { resolve, reject });
    }

    public abstract init(): Promise<void>;

    public abstract close(): void;

    protected _receive(message: ResponseMessage): boolean {
        // Discard all messages from unwanted sources
        // or which are not replies
        // or which are not from the correct origin
        if (!message.data
            || !message.data.status
            || !message.data.id
            || (this._allowedOrigin !== '*' && message.origin !== this._allowedOrigin)) return false;
        const data = message.data;

        const callback = this._getCallback(data.id);
        const state = this._waitingRequests.getState(data.id);

        if (callback) {
            if (!this._preserveRequests) {
                this._waitingRequests.remove(data.id);
                this._responseHandlers.delete(data.id);
            }

            console.debug('RpcClient RECEIVE', data);

            if (data.status === ResponseStatus.OK) {
                callback.resolve(data.result, data.id, state);
            } else if (data.status === ResponseStatus.ERROR) {
                const error = new Error(data.result.message);
                if (data.result.stack) {
                    error.stack = data.result.stack;
                }
                if (data.result.name) {
                    error.name = data.result.name;
                }
                callback.reject(error, data.id, state);
            }
            return true;
        } else {
            console.warn('Unknown RPC response:', data);
            return false;
        }
    }

    protected _getCallback(id: number): ResponseHandler | undefined {
        // Response handlers by id have priority to more general ones by command
        if (this._responseHandlers.has(id)) {
            return this._responseHandlers.get(id);
        } else {
            const command = this._waitingRequests.getCommand(id);
            if (command) {
                return this._responseHandlers.get(command);
            }
        }
        return undefined;
    }
}

class PostMessageRpcClient extends RpcClient {
    private _target: Window | null;
    private readonly _receiveListener: (message: MessageEvent) => any;
    private _connectionState: PostMessageRpcClient.ConnectionState;
    private _serverCloseCheckInterval: number = -1;

    constructor(targetWindow: Window, allowedOrigin: string) {
        super(allowedOrigin);
        this._target = targetWindow;
        this._connectionState = PostMessageRpcClient.ConnectionState.DISCONNECTED;

        this._receiveListener = this._receive.bind(this);
    }

    public async init() {
        if (this._connectionState === PostMessageRpcClient.ConnectionState.CONNECTED) {
            return;
        }
        await this._connect();
        window.addEventListener('message', this._receiveListener);
        if (this._serverCloseCheckInterval !== -1) return;
        this._serverCloseCheckInterval = window.setInterval(() => this._checkIfServerClosed(), 300);
    }

    public async call(command: string, ...args: any[]): Promise<any> {
        return this._call({
            command,
            args,
            id: RandomUtils.generateRandomId(),
        });
    }

    public close() {
        // Clean up old requests and disconnect. Note that until the popup get's closed by the user
        // it's possible to connect again though by calling init.
        this._connectionState = PostMessageRpcClient.ConnectionState.DISCONNECTED;
        window.removeEventListener('message', this._receiveListener);
        window.clearInterval(this._serverCloseCheckInterval);
        this._serverCloseCheckInterval = -1;
        for (const [id, { reject }] of this._responseHandlers) {
            const state = this._waitingRequests.getState(id);
            reject(
                'Connection was closed',
                typeof id === 'number' ? id : undefined,
                state,
            );
        }
        this._waitingRequests.clear();
        this._responseHandlers.clear();

        if (this._target && this._target.closed) this._target = null;
    }

    protected _receive(message: ResponseMessage & MessageEvent): boolean {
        if (message.source !== this._target) {
            // ignore messages originating from another client's target window
            return false;
        }
        return super._receive(message);
    }

    private async _call(request: {command: string, args: any[], id: number}): Promise<any> {
        if (!this._target || this._target.closed) {
            throw new Error('Connection was closed.');
        }
        if (this._connectionState !== PostMessageRpcClient.ConnectionState.CONNECTED) {
            throw new Error('Client is not connected, call init first');
        }

        return new Promise<any>((resolve, reject) => {
            // Store the request resolvers
            this._responseHandlers.set(request.id, { resolve, reject });
            this._waitingRequests.add(request.id, request.command);

            console.debug('RpcClient REQUEST', request.command, request.args);

            this._target!.postMessage(request, this._allowedOrigin);
        });
    }

    private _connect() {
        if (this._connectionState === PostMessageRpcClient.ConnectionState.CONNECTED) return;
        this._connectionState = PostMessageRpcClient.ConnectionState.CONNECTING;

        return new Promise((resolve, reject) => {
            const connectedListener = (message: MessageEvent) => {
                const { source, origin, data } = message;
                if (source !== this._target
                    || data.status !== ResponseStatus.OK
                    || data.result !== 'pong'
                    || data.id !== 1
                    || (this._allowedOrigin !== '*' && origin !== this._allowedOrigin)) return;

                // Debugging printouts
                if (data.result.stack) {
                    const error = new Error(data.result.message);
                    error.stack = data.result.stack;
                    if (data.result.name) {
                        error.name = data.result.name;
                    }
                    console.error(error);
                }

                window.removeEventListener('message', connectedListener);

                this._connectionState = PostMessageRpcClient.ConnectionState.CONNECTED;

                console.log('RpcClient: Connection established');
                resolve(true);
            };

            window.addEventListener('message', connectedListener);

            /**
             * Send 'ping' command every 100ms, until cancelled
             */
            const tryToConnect = () => {
                if (this._connectionState === PostMessageRpcClient.ConnectionState.CONNECTED) return;

                if (this._connectionState === PostMessageRpcClient.ConnectionState.DISCONNECTED
                    || this._checkIfServerClosed()) {
                    window.removeEventListener('message', connectedListener);
                    reject(new Error('Connection was closed'));
                    return;
                }

                try {
                    this._target!.postMessage({ command: 'ping', id: 1 }, this._allowedOrigin);
                } catch (e) {
                    console.error(`postMessage failed: ${e}`);
                }

                window.setTimeout(tryToConnect, 100);
            };

            window.setTimeout(tryToConnect, 100);
        });
    }

    private _checkIfServerClosed() {
        if (this._target && !this._target.closed) return false;
        this.close();
        return true;
    }
}
/* tslint:disable-next-line:no-namespace */
namespace PostMessageRpcClient {
    export const enum ConnectionState {
        DISCONNECTED,
        CONNECTING,
        CONNECTED,
    }
}
export { PostMessageRpcClient };

export interface CallOptions {
    state?: ObjectType;
    handleHistoryBack?: boolean;
    responseMethod?: ResponseMethod;
}

export class RedirectRpcClient extends RpcClient {
    protected readonly _preserveRequests: boolean;
    private readonly _target: string;

    constructor(targetURL: string, allowedOrigin: string, preserveRequests = true) {
        super(allowedOrigin, /*storeState*/ true);
        this._target = targetURL;
        this._preserveRequests = preserveRequests;
    }

    public async init() {
        // Check for a response in the URL (also removes params)
        const urlResponse = UrlRpcEncoder.receiveRedirectResponse(window.location);
        if (urlResponse) {
            this._receive(urlResponse);
            return;
        }

        // If there was no response in the URL it might be a history.back.
        if (this._rejectOnBack()) return; // if rejectOnBack did reject do not look for a stored response

        // Check for a stored response referenced by a URL 'id' parameter
        const searchParams = new URLSearchParams(window.location.search);
        if (searchParams.has(UrlRpcEncoder.URL_SEARCHPARAM_NAME)) {
            const storedResponse = window.sessionStorage.getItem(
                `response-${searchParams.get(UrlRpcEncoder.URL_SEARCHPARAM_NAME)}`,
            );
            if (storedResponse) {
                this._receive(JSONUtils.parse(storedResponse), false);
                return;
            }
        }
    }

    /* tslint:disable-next-line:no-empty */
    public close() { }

    public call(
        returnURL: string,
        command: string,
        optionsOrHandleHistory?: CallOptions | boolean | null,
        ...args: any[]): void {
        if (!optionsOrHandleHistory || typeof optionsOrHandleHistory === 'boolean') {
            if (typeof optionsOrHandleHistory === 'boolean') {
                console.warn('RedirectRpcClient.call(string, string, boolean, any[]) is deprecated.'
                    + ' Use RedirectRpcClient.call(string, string, CallOptions, any[]) with an'
                    + ' appropriate CallOptions object instead.');
            }
            this._call(
                returnURL,
                command,
                {
                    responseMethod: ResponseMethod.HTTP_GET,
                    handleHistoryBack: !!optionsOrHandleHistory,
                },
                ...args,
            );
        } else if (typeof optionsOrHandleHistory === 'object') {
            // Options are given, warn in case they do not make sense.
            // ResponseMethod.POST_MESSAGE does not have a single strong use case for redirects and could be omitted
            // until at least one of the following use cases is properly implemented.
            // TODO: We might want to support those cases in the future. See comment.
            if (optionsOrHandleHistory.responseMethod === ResponseMethod.POST_MESSAGE) {
                if (!window.opener && !window.parent) {
                    throw new Error('Window has no opener or parent,'
                        + ' responseMethod: ResponseMethod.POST_MESSAGE would fail.');
                } else {
                    // Could be mitigated i.e. by having the 'middle' rpcServer communicate to the initial rpcClient
                    // the new requestId the request is going to be answered by in case of a redirect within a popup.
                    // In case of opening a popup with url encoded parameters instead of post message, thereby
                    // circumventing client.call(), the popup opening behaviour could be implemented in _call() to
                    // re-enable usage of the call() method.
                    console.warn('Response will skip at least one rpc call, which will result in an unknown response.');
                }
            }
            this._call(returnURL,  command, optionsOrHandleHistory, ...args);
        }
    }

    /**
     * @deprecated Use call() with an appropriate `CallOptions` object instead.
     */
    public callAndSaveLocalState(
        returnURL: string,
        state: ObjectType | null,
        command: string,
        handleHistoryBack = false,
        ...args: any[]) {
        console.warn('RedirectRpcClient.callAndSaveLocalState() is deprecated. Use RedirectRpcClient.call()'
            + ' with an apropriate CallOptions object instead.');
        this._call(
            returnURL,
            command,
            {
                responseMethod: ResponseMethod.HTTP_GET,
                state: state ? state : undefined,
                handleHistoryBack,
            },
            ...args);
    }

    protected _receive(response: ResponseMessage, persistMessage = true): boolean {
        const responseWasHandled = super._receive(response);
        if (responseWasHandled && persistMessage) {
            window.sessionStorage.setItem(`response-${response.data.id}`, JSONUtils.stringify(response));
        }
        return responseWasHandled;
    }

    private _call(returnURL: string, command: string, callOptions: CallOptions, ...args: any[]): void {
        const id = RandomUtils.generateRandomId();
        const responseMethod = callOptions.responseMethod || ResponseMethod.HTTP_GET;
        const url = UrlRpcEncoder.prepareRedirectInvocation(this._target, id, returnURL, command, args, responseMethod);

        this._waitingRequests.add(id, command, callOptions.state || null);

        if (callOptions.handleHistoryBack) {
            /**
             * The rpcBackRejectionId in the history.state is used to detect in the client
             * if a history entry was visited before, which makes it a history.back
             * navigation. The stored ID is then also used to retrieve the correct
             * stored callback and waiting request, to be able to reject it.
             */
            history.replaceState(Object.assign({}, history.state, { rpcBackRejectionId: id }), '');
        }

        console.debug('RpcClient REQUEST', command, args);

        window.location.href = url;
    }

    private _rejectOnBack(): boolean {
        if (!history.state || !history.state.rpcBackRejectionId) return false;

        const id = history.state.rpcBackRejectionId;

        // Delete the ID, so the request is not rejected again when the page is refreshed/revisited
        history.replaceState(Object.assign({}, history.state, { rpcBackRejectionId: null }), '');

        const callback = this._getCallback(id);
        const state = this._waitingRequests.getState(id);

        if (callback) {
            if (!this._preserveRequests) {
                this._waitingRequests.remove(id);
                this._responseHandlers.delete(id);
            }
            console.debug('RpcClient BACK');
            const error = new Error('Request aborted');
            callback.reject(error, id, state);
            return true;
        }
        return false;
    }
}

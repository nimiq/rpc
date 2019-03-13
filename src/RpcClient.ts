import { RandomUtils } from './RandomUtils';
import { ResponseMessage, ResponseStatus } from './Messages';
import { RequestIdStorage } from './RequestIdStorage';
import { UrlRpcEncoder } from './UrlRpcEncoder';

export interface ResponseHandler {
    resolve: (result: any, id?: number, state?: string | null) => any;
    reject: (error: any, id?: number, state?: string | null) => any;
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
                      resolve: (result: any, id?: number, state?: string | null) => any,
                      reject: (error: any, id?: number, state?: string | null) => any) {
        this._responseHandlers.set(command, { resolve, reject });
    }

    public abstract init(): Promise<void>;

    public abstract close(): void;

    protected _receive(message: ResponseMessage) {
        // Discard all messages from unwanted sources
        // or which are not replies
        // or which are not from the correct origin
        if (!message.data
            || !message.data.status
            || !message.data.id
            || (this._allowedOrigin !== '*' && message.origin !== this._allowedOrigin)) return;
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
        } else {
            console.warn('Unknown RPC response:', data);
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
    }

    public async call(command: string, ...args: any[]): Promise<any> {
        return this._call({
            command,
            args,
            id: RandomUtils.generateRandomId(),
        });
    }

    public async callAndPersist(command: string, ...args: any[]): Promise<any> {
        return this._call({
            command,
            args,
            id: RandomUtils.generateRandomId(),
            persistInUrl: true,
        });
    }

    public close() {
        // Clean up old requests and disconnect. Note that until the popup get's closed by the user
        // it's possible to connect again though by calling init.
        this._connectionState = PostMessageRpcClient.ConnectionState.DISCONNECTED;
        window.removeEventListener('message', this._receiveListener);
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
    }

    private async _call(request: {command: string, args: any[], id: number, persistInUrl?: boolean}): Promise<any> {
        if (this._connectionState !== PostMessageRpcClient.ConnectionState.CONNECTED
            && this._target && !this._target.closed) {
            throw new Error('Client is not connected, call init first');
        }

        return new Promise<any>((resolve, reject) => {
            // Store the request resolvers
            this._responseHandlers.set(request.id, { resolve, reject });
            this._waitingRequests.add(request.id, request.command);

            // Periodically check if recipient window is still open
            const checkIfServerWasClosed = () => {
                if (!this._target || this._target.closed) {
                    this._target = null;
                    this.close();
                    reject(new Error('Window was closed'));
                    return true;
                }
                setTimeout(checkIfServerWasClosed, 500);
                return false;
            };
            if (checkIfServerWasClosed()) return;

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
                window.addEventListener('message', this._receiveListener);
                resolve(true);
            };

            window.addEventListener('message', connectedListener);

            /**
             * Send 'ping' command every 100ms, until cancelled
             */
            const tryToConnect = () => {
                if (this._connectionState === PostMessageRpcClient.ConnectionState.CONNECTED) return;

                if (this._connectionState === PostMessageRpcClient.ConnectionState.DISCONNECTED) {
                    window.removeEventListener('message', connectedListener);
                    reject(new Error('Connection was manually closed before being established'));
                    return;
                }

                if (!this._target || this._target.closed) {
                    window.removeEventListener('message', connectedListener);
                    this._target = null;
                    this.close();
                    reject(new Error('Window was closed'));
                    return;
                }

                try {
                    this._target.postMessage({ command: 'ping', id: 1 }, this._allowedOrigin);
                } catch (e) {
                    console.error(`postMessage failed: ${e}`);
                }

                window.setTimeout(tryToConnect, 100);
            };

            window.setTimeout(tryToConnect, 100);
        });
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

export class RedirectRpcClient extends RpcClient {
    protected readonly _preserveRequests: boolean;
    private readonly _target: string;

    constructor(targetURL: string, allowedOrigin: string, preserveRequests = true) {
        super(allowedOrigin, /*storeState*/ true);
        this._target = targetURL;
        this._preserveRequests = preserveRequests;
    }

    public async init() {
        const message = UrlRpcEncoder.receiveRedirectResponse(window.location);
        if (message) {
            this._receive(message);

        // The URL the user goes back to in the browser history (the page
        // that this RpcClient is inited on) may itself have been a
        // URL-encoded RPC request. Thus before triggering a potential
        // rejection of the called request, we make sure that there is
        // no RPC request in the URL, to be able to re-start the actual
        // request that the user goes back to.
        } else if (!UrlRpcEncoder.receiveRedirectCommand(window.location)) {
            this._rejectOnBack();
        }
    }

    /* tslint:disable-next-line:no-empty */
    public close() { }

    public call(returnURL: string, command: string, ...args: any[]) {
        this.callAndSaveLocalState(returnURL, null, command, ...args);
    }

    public callAndSaveLocalState(returnURL: string, state: string | null, command: string, ...args: any[]) {
        const id = RandomUtils.generateRandomId();
        const url = UrlRpcEncoder.prepareRedirectInvocation(this._target, id, returnURL, command, args);

        this._waitingRequests.add(id, command, state);

        history.replaceState({rpcRequestId: id}, document.title);

        console.debug('RpcClient REQUEST', command, args);

        window.location.href = url;
    }

    private _rejectOnBack() {
        if (history.state && history.state.rpcRequestId) {
            const id = history.state.rpcRequestId;

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
            }
        }
    }
}

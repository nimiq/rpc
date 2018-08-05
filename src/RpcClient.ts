interface ResponseHandler {
    resolve: (result: any, id?: number, state?: string|null) => any;
    reject: (error: any, id?: number, state?: string|null) => any;
}

abstract class RpcClient {
    protected readonly _allowedOrigin: string;
    protected _waitingRequests: RequestIdStorage;
    protected _responseHandlers: Map<string | number, ResponseHandler>;

    protected constructor(allowedOrigin: string, storeState: boolean = false) {
        this._allowedOrigin = allowedOrigin;
        this._waitingRequests = new RequestIdStorage(storeState);
        this._responseHandlers = new Map();
    }

    public onResponse(command: string,
                      resolve: (result: any, id?: number, state?: string | null) => any,
                      reject: (error: any, id?: number, state?: string | null) => any) {
        this._responseHandlers.set(command, {resolve, reject});
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

        // Response handlers by id have priority to more general ones by command
        let callback;
        if (this._responseHandlers.has(data.id)) {
            callback = this._responseHandlers.get(data.id);
        } else {
            const command = this._waitingRequests.getCommand(data.id);
            if (command) {
                callback = this._responseHandlers.get(command);
            }
        }

        const state = this._waitingRequests.getState(data.id);

        if (callback) {
            this._waitingRequests.remove(data.id);

            console.debug('RpcClient RECEIVE', data);

            if (data.status === ResponseStatus.OK) {
                callback.resolve(data.result, data.id, state);
            } else if (data.status === 'error') {
                const error = new Error(data.result.message);
                if (data.result.stack) {
                    error.stack = data.result.stack;
                }
                callback.reject(error, data.id, state);
            }
        } else {
            console.warn('Unknown RPC response:', data);
        }
    }
}

class PostMessageRpcClient extends RpcClient {
    private readonly _target: Window;
    private readonly _receiveListener: (message: MessageEvent) => any;
    private _connected: boolean;

    constructor(targetWindow: Window, allowedOrigin: string) {
        super(allowedOrigin);
        this._target = targetWindow;
        this._connected = false;

        this._receiveListener = this._receive.bind(this);
    }

    public async init() {
        await this._connect();
        window.addEventListener('message', this._receiveListener);
    }

    public async call(command: string, ...args: any[]) {
        if (!this._connected) throw new Error('Client is not connected, call init first');

        return new Promise((resolve, reject) => {
            const obj = {
                command,
                args,
                id: RandomUtils.generateRandomId(),
            };

            // Store the request resolvers
            this._responseHandlers.set(obj.id, { resolve, reject });
            this._waitingRequests.add(obj.id, command);

            console.debug('RpcClient REQUEST', command, args);

            this._target.postMessage(obj, this._allowedOrigin);
        });
    }

    public close() {
        window.removeEventListener('message', this._receiveListener);
    }

    private _connect() {
        return new Promise((resolve, reject) => {
            /**
             * @param {MessageEvent} message
             */
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
                    console.error(error);
                }

                window.removeEventListener('message', connectedListener);

                this._connected = true;

                console.log('RpcClient: Connection established');
                window.addEventListener('message', this._receiveListener);
                resolve(true);
            };

            window.addEventListener('message', connectedListener);

            let connectTimer = 0;
            const timeoutTimer = setTimeout(() => {
                window.removeEventListener('message', connectedListener);
                clearTimeout(connectTimer);
                reject(new Error('Connection timeout'));
            }, 10 * 1000);

            /**
             * Send 'ping' command every second, until cancelled
             */
            const tryToConnect = () => {
                if (this._connected) {
                    clearTimeout(timeoutTimer);
                    return;
                }

                try {
                    this._target.postMessage({ command: 'ping', id: 1 }, this._allowedOrigin);
                } catch (e) {
                    console.error(`postMessage failed: ${e}`);
                }

                // @ts-ignore
                connectTimer = setTimeout(tryToConnect, 1000);
            };

            // @ts-ignore
            connectTimer = setTimeout(tryToConnect, 100);
        });
    }
}

class RedirectRpcClient extends RpcClient {
    private readonly _target: string;

    constructor(targetURL: string, allowedOrigin: string) {
        super(allowedOrigin, /*storeState*/ true);
        this._target = targetURL;
    }

    public async init() {
        const message = UrlRpcEncoder.receiveRedirectResponse(window.location);
        if (message) {
            this._receive(message);
        }
    }

    /* tslint:disable:no-empty */
    public close() {}

    public call(returnURL: string, command: string, ...args: any[]) {
        this.callAndSaveLocalState(returnURL, null, command, ...args);
    }

    public callAndSaveLocalState(returnURL: string, state: string|null, command: string, ...args: any[]) {
        const id = RandomUtils.generateRandomId();
        const url = UrlRpcEncoder.prepareRedirectInvocation(this._target, id, returnURL, command, args);

        this._waitingRequests.add(id, command, state);

        console.debug('RpcClient REQUEST', command, args);

        window.location.href = url;
    }
}
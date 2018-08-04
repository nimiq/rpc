/**
 * @typedef {Object} responseHandler
 * @property {function(result:*, id:number, state:?string)} resolve
 * @property {function(error:*, id:number, state:?string)} reject
 */

class RpcClient {
    /**
     * @param {string} allowedOrigin The origin that is allowed to call this server
     * @param {boolean} [storeState=false] Whether to store state in sessionStorage
     * @returns {RpcClient}
     * @protected
     */
    constructor(allowedOrigin, storeState = false) {
        this._allowedOrigin = allowedOrigin;
        this._waitingRequests = new RequestIdStorage(storeState);
        /** @type {Map<string|number,responseHandler>} */
        this._responseHandlers = new Map();
    }

    /**
     * @param {string} command
     * @param {Function} resolve
     * @param {Function} reject
     */
    onResponse(command, resolve, reject) {
        this._responseHandlers.set(command, { resolve, reject });
    }

    /**
     * @param {{origin:string, data:{id:number, status:string, result:*}}} message
     */
    _receive(message) {
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
            callback = this._responseHandlers.get(command);
        }

        const state = this._waitingRequests.getState(data.id);

        if (callback) {
            this._waitingRequests.remove(data.id);

            console.debug('RpcClient RECEIVE', data);

            if (data.status === RpcClient.STATUS_OK) {
                callback.resolve(data.result, data.id, state);
            } else if (data.status === 'error') {
                const error = new Error(data.result.message);
                if (data.result.code && data.result.stack) {
                    error.code = code;
                    error.stack = stack;
                }
                callback.reject(error, data.id, state);
            }
        } else {
            console.warn('Unknown RPC response:', data);
        }
    }

    /**
     * @return {Promise<boolean>}
     */
    init() {
        return Promise.resolve(true);
    }

    close() {}
}
RpcClient.STATUS_ERROR = 'error';
RpcClient.STATUS_OK = 'ok';

class PostMessageRpcClient extends RpcClient {
    /**
     * @param {Window} targetWindow
     * @param {string} allowedOrigin
     * @returns {PostMessageRpcClient}
     */
    constructor(targetWindow, allowedOrigin) {
        super(allowedOrigin);
        this._target = targetWindow;
        this._connected = false;

        this._receiveListener = this._receive.bind(this);
    }

    /**
     * @returns {Promise<boolean>}
     */
    async init() {
        await this._connect();
        window.addEventListener('message', this._receiveListener);
    }

    /**
     * @returns {Promise<boolean>}
     */
    _connect() {
        return new Promise((resolve, reject) => {
            /**
             * @param {MessageEvent} message
             */
            const connectedListener = ({ source, origin, data }) => {
                if (source !== this._target
                    || data.status !== RpcClient.STATUS_OK
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

    /**
     * @param {string} command
     * @param {...*} [args]
     * @returns {Promise<*>}
     */
    async call(command, ...args) {
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

    close() {
        window.removeEventListener('message', this._receiveListener);
    }
}

class RedirectRpcClient extends RpcClient {
    /**
     * @param {string} targetURL
     * @param {string} allowedOrigin
     * @returns {PostMessageRpcClient}
     */
    constructor(targetURL, allowedOrigin) {
        super(allowedOrigin, /*storeState*/ true);
        this._target = targetURL;
    }

    /**
     * @returns {Promise<boolean>}
     */
    async init() {
        const message = UrlRpcEncoder.receiveRedirectResponse(window.location);
        if (message) {
            this._receive(message);
        }
        return true;
    }

    /**
     * @param {string} returnURL
     * @param {string} command
     * @param {...*} [args]
     */
    call(returnURL, command, ...args) {
        this.callWithLocalState(returnURL, null, command, ...args);
    }

    /**
     * @param {string} returnURL
     * @param {?string} state
     * @param {string} command
     * @param {...*} [args]
     */
    callWithLocalState(returnURL, state, command, ...args) {
        const id = RandomUtils.generateRandomId();
        const url = UrlRpcEncoder.prepareRedirectInvocation(this._target, id, returnURL, command, args);

        this._waitingRequests.add(id, command, state);

        console.debug('RpcClient REQUEST', command, args);

        document.location = url;
    }
}

/**
 * @typedef {function(state:State, args:...*):*} commandHandler
 */

class RpcServer {
    /**
     * @param {string} allowedOrigin - The origin that is allowed to call this server
     * @returns {RpcServer}
     */
    constructor(allowedOrigin) {
        this._allowedOrigin = allowedOrigin;
        /** @type {Map<string,commandHandler>} */
        this._responseHandlers = new Map();
        this._responseHandlers.set('ping', () => 'pong');
        this._receiveListener = this._receive.bind(this);
    }

    /**
     * @param {string} command
     * @param {commandHandler} fn
     */
    onRequest(command, fn) {
        this._responseHandlers.set(command, fn);
    }

    init() {
        window.addEventListener('message', this._receiveListener);

        this._receiveRedirect();
    }

    close() {
        window.removeEventListener('message', this._receiveListener);
    }

    _receiveRedirect() {
        const message = UrlRpcEncoder.receiveRedirectCommand(window.location);
        if (message) {
            this._receive(message);
        }
    }

    /**
     * @param {MessageEvent|{origin:string, data:{id:number, command:string, args:*}, returnURL:string}} message
     */
    _receive(message) {
        let state = null;
        try {
            state = new State(message);

            // Cannot reply to a message that has no source window or return URL
            if (!message.source && !message.returnURL) return;

            // Ignore messages without a command
            if (!state.data.command) return;

            if (this._allowedOrigin !== '*' && message.origin !== this._allowedOrigin) {
                throw new Error('Unauthorized');
            }

            const args = message.data.args && Array.isArray(message.data.args) ? message.data.args : [];

            // Test if request calls a valid handler with the correct number of arguments
            if (!this._responseHandlers.has(state.data.command)) {
                throw new Error(`Unknown command: ${state.data.command}`);
            }
            const requestedMethod = this._responseHandlers.get(state.data.command);
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
                    .then(finalResult => {
                        if (finalResult !== undefined) {
                            RpcServer._ok(state, finalResult);
                        }
                    })
                    .catch(error => RpcServer._error(state, error));
            } else if (result !== undefined) {
                RpcServer._ok(state, result);
            }
        } catch (error) {
            if (state) {
                RpcServer._error(state, error);
            }
        }
    }

    /**
     * @param {State} state
     * @param {*} result
     */
    static _ok(state, result) {
        state.reply(RpcServer.STATUS_OK, result);
    }

    /**
     * @param {State} state
     * @param {Error} error
     */
    static _error(state, error) {
        state.reply(RpcServer.STATUS_ERROR,
            error.message
                ? { message: error.message, stack: error.stack, code: error.code }
                : { message: error });
    }
}
RpcServer.STATUS_ERROR = 'error';
RpcServer.STATUS_OK = 'ok';

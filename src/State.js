class State {
    /**
     * @param {MessageEvent|{origin:string, data:Object, returnURL:string}|{origin:string, data:Object, source:string}} message
     */
    constructor(message) {
        if (!message.data.id) throw Error('Missing id');

        this._origin = message.origin;
        this._id = message.data.id;
        this._postMessage = message.source && !message.returnURL;
        this._returnURL = message.returnURL;
        this._data = message.data;
        this._source = message.source ? message.source : null;
    }

    get id() {
        return this._id;
    }

    get origin() {
        return this._origin;
    }

    get data() {
        return this._data;
    }

    get returnURL() {
        return this._returnURL;
    }

    toJSON() {
        const obj = {
            origin: this._origin,
            data: this._data,
        };

        if (this._postMessage) {
            if (this._source === window.opener) {
                obj.source = 'opener';
            } else if (this._source === window.parent) {
                obj.source = 'parent';
            } else {
                obj.source = null;
            }
        } else {
            obj.returnURL = this._returnURL;
        }
        return JSON.stringify(obj);
    }

    static fromJSON(json) {
        const obj = JSON.parse(json);
        return new State(obj);
    }

    /**
     * @param {string} status
     * @param {*} result
     */
    reply(status, result) {
        console.debug('RpcServer REPLY', result);

        if (this._postMessage) {
            // Send via postMessage (e.g., popup)

            let target;
            // If source is given, choose accordingly
            if (this._source) {
                if (this._source === 'opener') {
                    target = window.opener;
                } else if (this._source === 'parent') {
                    target = window.parent;
                } else {
                    target = this._source;
                }
            } else {
                // Else guess
                target = window.opener || window.parent;
            }
            target.postMessage({
                status,
                result,
                id: this.id
            }, this.origin);
        } else if (this._returnURL) {
            // Send via top-level navigation
            document.location = UrlRpcEncoder.prepareRedirectReply(this, status, result);
        }
    }
}

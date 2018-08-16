import {PostMessage, RedirectRequest, ResponseStatus} from './Messages';
import {UrlRpcEncoder} from './UrlRpcEncoder';
export {ResponseStatus} from './Messages';

export class State {

    get id() {
        return this._id;
    }

    get origin() {
        return this._origin;
    }

    get data(): any {
        return this._data;
    }

    get returnURL() {
        return this._returnURL;
    }

    get source() {
        return this._source;
    }

    public static fromJSON(json: string) {
        const obj = JSON.parse(json);
        return new State(obj);
    }
    private readonly _origin: string;
    private readonly _id: number;
    private readonly _postMessage: boolean;
    private readonly _returnURL: string | null;
    private readonly _data: object;
    private readonly _source: MessagePort|Window|ServiceWorker|string|null;

    constructor(message: MessageEvent|RedirectRequest|PostMessage) {
        if (!message.data.id) throw Error('Missing id');

        this._origin = message.origin;
        this._id = message.data.id;
        this._postMessage = 'source' in message && !('returnURL' in message);
        this._returnURL = 'returnURL' in message ? message.returnURL : null;
        this._data = message.data;
        this._source = 'source' in message ? message.source : null;
    }

    public toJSON() {
        const obj: any = {
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

    public reply(status: ResponseStatus, result: any) {
        console.debug('RpcServer REPLY', result);

        if (status === ResponseStatus.ERROR) {
            // serialize error objects
            result = typeof result === 'object'
                ? { message: result.message, stack: result.stack }
                : { message: result };
        }

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
                id: this.id,
            }, this.origin);
        } else if (this._returnURL) {
            // Send via top-level navigation
            window.location.href = UrlRpcEncoder.prepareRedirectReply(this, status, result);
        }
    }
}

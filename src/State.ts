import { PostMessage, RedirectRequest, ResponseStatus, ResponseMethod } from './Messages';
import { UrlRpcEncoder } from './UrlRpcEncoder';
import { FormRpcEncoder } from './FormRpcEncoder';
export { ResponseStatus } from './Messages';
import { JSONUtils } from './JSONUtils';

export class State {

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

    get source() {
        return this._source;
    }

    public static fromJSON(json: string) {
        const obj = JSONUtils.parse(json);
        return new State(obj);
    }
    private readonly _origin: string;
    private readonly _id: number;
    private readonly _responseMethod: ResponseMethod;
    private readonly _returnURL: string | null;
    private readonly _data: {command: string, args: any[], id: number};
    private readonly _source: MessagePort|Window|ServiceWorker|string|null;

    constructor(message: MessageEvent|RedirectRequest|PostMessage) {
        if (!message.data.id) throw Error('Missing id');

        this._origin = message.origin;
        this._id = message.data.id;
        this._responseMethod = 'responseMethod' in message && !!message.responseMethod
            ? message.responseMethod
            : 'source' in message && !('returnURL' in message)
                ? ResponseMethod.POST_MESSAGE
                : ResponseMethod.HTTP_GET;
        this._returnURL = 'returnURL' in message ? message.returnURL : null;
        this._data = message.data;
        this._source = 'source' in message ? message.source : null;
    }

    public toJSON() {
        const obj: any = {
            origin: this._origin,
            data: this._data,
            responseMethod: this._responseMethod,
        };

        if (this._responseMethod === ResponseMethod.POST_MESSAGE) {
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
        return JSONUtils.stringify(obj);
    }

    public reply(status: ResponseStatus, result: any) {
        console.debug('RpcServer REPLY', result);

        if (status === ResponseStatus.ERROR) {
            // serialize error objects
            result = typeof result === 'object'
                ? { message: result.message, stack: result.stack, name: result.name }
                : { message: result };
        }

        // TODO: Clear waiting request storage?

        if (this._responseMethod === ResponseMethod.POST_MESSAGE) {
            // Send via postMessage (e.g., popup or url-persisted popup)

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
            if (this._responseMethod === ResponseMethod.HTTP_GET) {
                // Send via top-level navigation
                const reply = UrlRpcEncoder.prepareRedirectReply(this, status, result);
                window.location.href = reply;
            } else if (this._responseMethod === ResponseMethod.HTTP_POST) {
                // send via form to server
                const $form = FormRpcEncoder.prepareFormReply(this, status, result);
                $form.submit();
            }
        }
    }

    public toRequestObject(): RedirectRequest {
        if (this._responseMethod !== ResponseMethod.POST_MESSAGE && !this._returnURL) {
            throw new Error('Cannot convert to request object: returnURL is missing');
        }
        return {
            origin: this._origin,
            data: this._data,
            returnURL: this._returnURL || '',
            source: typeof this._source === 'string' ? this._source : null,
            responseMethod: this._responseMethod,
        };
    }
}

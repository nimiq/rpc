import { PostMessage, RedirectRequest, ResponseStatus, ResponseMethod } from './Messages';
import { UrlRpcEncoder } from './UrlRpcEncoder';
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
        this._responseMethod = 'responseMethod' in message && message.responseMethod !== undefined
            ? message.responseMethod
            : 'source' in message && !('returnURL' in message)
                ? ResponseMethod.MESSAGE
                : ResponseMethod.GET;
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

        if (this._responseMethod === ResponseMethod.MESSAGE) {
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

        if (this._responseMethod === ResponseMethod.MESSAGE) {
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
            if (this._responseMethod === ResponseMethod.GET) {
                // Send via top-level navigation
                const reply = UrlRpcEncoder.prepareRedirectReply(this, status, result);
                window.location.href = reply;
            } else if (this._responseMethod === ResponseMethod.POST) {
                // send via form to server
                const $form = document.createElement('form');
                $form.setAttribute('method', 'post');
                $form.setAttribute('action', this.returnURL!);
                $form.style.display = 'none';

                const $statusInput = document.createElement('input');
                $statusInput.setAttribute('type', 'text');
                $statusInput.setAttribute('name', 'status');
                $statusInput.setAttribute('value', status);
                $form.appendChild($statusInput);

                const $resultInput = document.createElement('input');
                $resultInput.setAttribute('type', 'text');
                $resultInput.setAttribute('name', 'result');
                $resultInput.setAttribute('value', JSONUtils.stringify(result));
                $form.appendChild($resultInput);

                const $idInput = document.createElement('input');
                $idInput.setAttribute('type', 'text');
                $idInput.setAttribute('name', 'rpcId');
                $idInput.setAttribute('value', this.id.toString());
                $form.appendChild($idInput);

                document.body.appendChild($form);
                $form.submit();
            }
        }
    }

    public toRequestObject(): RedirectRequest {
        if (this._responseMethod !== ResponseMethod.MESSAGE && !this._returnURL) {
            throw new Error('ReturnURL is needed');
        }
        return {
            origin: this._origin,
            data: this._data,
            returnURL: this._returnURL || '',
            source: typeof this._source === 'string' ? this._source : null,
            responseMethod: this._responseMethod as ResponseMethod,
        };
    }
}

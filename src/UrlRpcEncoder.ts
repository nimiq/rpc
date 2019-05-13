import { RedirectRequest, ResponseMessage, ResponseStatus, POSTMESSAGE_RETURN_URL } from './Messages';
import { JSONUtils } from './JSONUtils';
import { State } from './State';

export class UrlRpcEncoder {
    public static URL_SEARCHPARAM_NAME = 'rpcId';

    public static receiveRedirectCommand(location: Location): RedirectRequest|null {
        const url = new URL(location.href);

        // Need referrer for origin check
        if (!document.referrer) return null;
        const referrer = new URL(document.referrer);

        // Parse query
        const params = new URLSearchParams(url.search);
        const fragment = new URLSearchParams(url.hash.substring(1));

        // Ignore messages without an ID
        if (!fragment.has('id')) return null;
        const id = parseInt(fragment.get('id')!, 10);
        fragment.delete('id');
        params.set(UrlRpcEncoder.URL_SEARCHPARAM_NAME, id.toString());

        // Ignore messages without a command
        if (!fragment.has('command')) return null;
        const command = fragment.get('command')!;
        fragment.delete('command');

        // Ignore messages without a valid return path
        if (!fragment.has('returnURL')) return null;
        const returnURL = fragment.get('returnURL')!;
        fragment.delete('returnURL');
        const answerByPostMessage = returnURL === POSTMESSAGE_RETURN_URL
                                    && (window.opener || window.parent);
        // Only allow returning to same origin
        if (!answerByPostMessage && new URL(returnURL).origin !== referrer.origin) return null

        // Parse args
        let args = [];
        if (fragment.has('args')) {
            try {
                args = JSONUtils.parse(fragment.get('args')!);
            } catch (e) {
                // Do nothing
            }
        }
        args = Array.isArray(args) ? args : [];
        fragment.delete('args');

        url.search = params.toString();
        this._setUrlFragment(url, fragment);

        history.replaceState(history.state, '', url.href);

        return {
            origin: referrer.origin,
            data: {
                id,
                command,
                args,
            },
            returnURL,
            source: answerByPostMessage ? (window.opener || window.parent) : null,
        };
    }

    public static receiveRedirectResponse(location: Location): ResponseMessage|null {
        const url = new URL(location.href);
        // Need referrer for origin check
        if (!document.referrer) return null;
        const referrer = new URL(document.referrer);

        // Parse query
        const params = new URLSearchParams(url.search);
        const fragment = new URLSearchParams(url.hash.substring(1));

        // Ignore messages without an ID
        if (!fragment.has('id')) return null;
        const id = parseInt(fragment.get('id')!, 10);
        fragment.delete('id');
        params.set(UrlRpcEncoder.URL_SEARCHPARAM_NAME, id.toString());

        // Ignore messages without a status
        if (!fragment.has('status')) return null;
        const status = fragment.get('status') === ResponseStatus.OK ? ResponseStatus.OK : ResponseStatus.ERROR;
        fragment.delete('status');


        // Ignore messages without a result
        if (!fragment.has('result')) return null;
        const result = JSONUtils.parse(fragment.get('result')!);
        fragment.delete('result');

        url.search = params.toString();
        this._setUrlFragment(url, fragment);

        history.replaceState(history.state, '', url.href);

        return {
            origin: referrer.origin,
            data: {
                id,
                status,
                result,
            },
        };
    }

    public static prepareRedirectReply(state: State, status: ResponseStatus, result: any): string {
        const returnUrl = new URL(state.returnURL!);
        const fragment = new URLSearchParams(returnUrl.hash.substring(1));
        fragment.set('id', state.id.toString());
        fragment.set('status', status);
        fragment.set('result', JSONUtils.stringify(result));

        returnUrl.hash = fragment.toString();

        return returnUrl.href;
    }

    public static prepareRedirectInvocation(targetURL: string, id: number,
                                            returnURL: string, command: string,
                                            args: any[]): string {
        const targetUrl = new URL(targetURL);
        const fragment = new URLSearchParams(targetUrl.hash.substring(1));
        fragment.set('id', id.toString());
        fragment.set('returnURL', returnURL);
        fragment.set('command', command);

        if (Array.isArray(args)) {
            fragment.set('args', JSONUtils.stringify(args));
        }

        targetUrl.hash = fragment.toString();

        return targetUrl.href;
    }

    private static _setUrlFragment(url: URL, fragment: URLSearchParams) {
        /*
        The Url might include a fragment on its own before adding the parameters to it.
        It might even have a fragment consisting of other parameters.
        A '=' at the last position of the remaining fragment string indicates that at least one fragment
        part is remaining. Since URLSearchParams will try to represent a key=value pair with the value
        missing the '=' is added.
        Unfortunately fragments (as in regular fragment, not parameters) ending in a '=' will not
        work with this implementation. All other fragments, including other sets of parameters should be
        preserved by removing the '=' in case it exists at the end of the fragment. However, if other
        parameters are used without values (i.e. #abc&123&value) they will now include a '=' except
        for the last one (i.e. #abc=&123=&value), which is a valid input to URLSearchParams.
        */
        if (fragment.toString().endsWith('=')) {
            url.hash = fragment.toString().slice(0, -1);
        } else {
            url.hash = fragment.toString();
        }
    }
}

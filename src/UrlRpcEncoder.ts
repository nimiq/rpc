import {RedirectRequest, ResponseMessage, ResponseStatus, POSTMESSAGE_RETURN_URL} from './Messages';
import {JSONUtils} from './JSONUtils';
import {State} from './State';

export class UrlRpcEncoder {
    public static receiveRedirectCommand(location: Location): RedirectRequest|null {
        const url = new URL(location.href);

        // Need referrer for origin check
        if (!document.referrer) return null;
        const referrer = new URL(document.referrer);

        // Parse query
        const params = new URLSearchParams(url.search);
        // Ignore messages without an ID
        if (!params.has('id')) return null;

        const fragment = new URLSearchParams(url.hash.substring(1));

        // Ignore messages without a command
        if (!fragment.has('command')) return null;
        const command = fragment.get('command')!;
        fragment.delete('command');

        // Ignore messages without a valid return path
        if (!fragment.has('returnURL')) return null;
        const returnURL = fragment.get('returnURL')!;
        const answerByPostMessage = fragment.get('returnURL') === POSTMESSAGE_RETURN_URL
                                    && (window.opener || window.parent);
        if (!answerByPostMessage) {
            // Only allow returning to same origin
            const returnURL = new URL(fragment.get('returnURL')!);
            if (returnURL.origin !== referrer.origin) return null;
        }
        fragment.delete('returnURL');

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

        if (fragment.toString().endsWith('=')) {
            url.hash = fragment.toString().slice(0, -1);
        } else {
            url.hash = fragment.toString();
        }
        history.replaceState(history.state, /* title */ '', url.href);

        return {
            origin: referrer.origin,
            data: {
                id: parseInt(params.get('id')!, 10),
                command,
                args,
            },
            returnURL,
            source: answerByPostMessage ? (window.opener || window.parent) : null,
        };
    }

    public static receiveRedirectResponse(url: URL|Location): ResponseMessage|null {
        // Need referrer for origin check
        if (!document.referrer) return null;
        const referrer = new URL(document.referrer);

        // Parse query
        const params = new URLSearchParams(url.search);

        // Ignore messages without an ID
        if (!params.has('id')) return null;

        const fragment = new URLSearchParams(url.hash.substring(1));

        // Ignore messages without a status
        if (!fragment.has('status')) return null;
        const status = fragment.get('status') === ResponseStatus.OK ? ResponseStatus.OK : ResponseStatus.ERROR;
        fragment.delete('status');


        // Ignore messages without a result
        if (!fragment.has('result')) return null;
        const result = JSONUtils.parse(fragment.get('result')!);
        fragment.delete('result');

        if (fragment.toString().endsWith('=')) {
            url.hash = fragment.toString().slice(0, -1);
        } else {
            url.hash = fragment.toString();
        }
        history.replaceState(history.state, /* title */ '', url.href);

        return {
            origin: referrer.origin,
            data: {
                id: parseInt(params.get('id')!, 10),
                status,
                result,
            },
        };
    }

    public static prepareRedirectReply(state: State, status: ResponseStatus, result: any): string {
        const returnUrl = new URL(state.returnURL!);
        const search = returnUrl.searchParams;
        search.set('id', state.id.toString());
        const fragment = new URLSearchParams(returnUrl.hash.substring(1));
        fragment.set('status', status);
        fragment.set('result', JSONUtils.stringify(result));

        returnUrl.hash = fragment.toString();

        return returnUrl.href;
    }

    public static prepareRedirectInvocation(targetURL: string, id: number,
                                            returnURL: string, command: string,
                                            args: any[]): string {
        const targetUrl = new URL(targetURL);
        const search = targetUrl.searchParams;
        search.set('id', id.toString());
        const fragment = new URLSearchParams(targetUrl.hash.substring(1));
        fragment.set('returnURL', returnURL);
        fragment.set('command', command);

        if (Array.isArray(args)) {
            fragment.set('args', JSONUtils.stringify(args));
        }

        targetUrl.hash = fragment.toString();

        return targetUrl.href;
    }
}

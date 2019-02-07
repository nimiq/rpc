import {RedirectRequest, ResponseMessage, ResponseStatus, POSTMESSAGE_RETURN_URL} from './Messages';
import {JSONUtils} from './JSONUtils';
import {State} from './State';

export class UrlRpcEncoder {
    public static receiveRedirectCommand(url: URL|Location): RedirectRequest|null {
        // Need referrer for origin check
        if (!document.referrer) return null;

        // Parse query
        const params = new URLSearchParams(url.search);
        const referrer = new URL(document.referrer);

        // Ignore messages without a command
        if (!params.has('command')) return null;

        // Ignore messages without an ID
        if (!params.has('id')) return null;

        // Ignore messages without a valid return path
        if (!params.has('returnURL')) return null;

        const answerByPostMessage = params.get('returnURL') === POSTMESSAGE_RETURN_URL
                                    && (window.opener || window.parent);
        if (!answerByPostMessage) {
            // Only allow returning to same origin
            const returnURL = new URL(params.get('returnURL')!);
            if (returnURL.origin !== referrer.origin) return null;
        }

        // Parse args
        let args = [];
        if (params.has('args')) {
            try {
                args = JSONUtils.parse(params.get('args')!);
            } catch (e) {
                // Do nothing
            }
        }
        args = Array.isArray(args) ? args : [];

        return {
            origin: referrer.origin,
            data: {
                id: parseInt(params.get('id')!, 10),
                command: params.get('command')!,
                args,
            },
            returnURL: params.get('returnURL')!,
            source: answerByPostMessage ? (window.opener || window.parent) : null,
        };
    }

    public static receiveRedirectResponse(url: URL|Location): ResponseMessage|null {
        // Need referrer for origin check
        if (!document.referrer) return null;

        // Parse query
        const params = new URLSearchParams(url.search);
        const referrer = new URL(document.referrer);

        // Ignore messages without a status
        if (!params.has('status')) return null;

        // Ignore messages without an ID
        if (!params.has('id')) return null;

        // Ignore messages without a result
        if (!params.has('result')) return null;

        // Parse result
        const result = JSONUtils.parse(params.get('result')!);
        const status = params.get('status') === ResponseStatus.OK ? ResponseStatus.OK : ResponseStatus.ERROR;

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
        const params = returnUrl.searchParams;
        params.set('status', status);
        params.set('result', JSONUtils.stringify(result));
        params.set('id', state.id.toString());

        return returnUrl.href;
    }

    public static prepareRedirectInvocation(targetURL: string, id: number,
                                            returnURL: string, command: string,
                                            args: any[]): string {
        const targetUrl = new URL(targetURL);
        const params = targetUrl.searchParams;
        params.set('id', id.toString());
        params.set('returnURL', returnURL);
        params.set('command', command);

        if (Array.isArray(args)) {
            params.set('args', JSONUtils.stringify(args));
        }

        return targetUrl.href;
    }
}

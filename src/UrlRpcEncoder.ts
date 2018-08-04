class UrlRpcEncoder {
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

        // Only allow returning to same origin
        const returnURL = new URL(params.get('returnURL')!);
        if (returnURL.origin !== referrer.origin) return null;

        // Parse args
        // TODO: Improve encoding
        let args = [];
        if (params.has('args')) {
            try {
                args = JSON.parse(params.get('args')!);
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
        };
    }

    /**
     * @param {URL|Location} url
     * @return {{origin:string, data:{id:number, status:string, result:*}}}
     */
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
        // TODO: Improve encoding
        const result = JSON.parse(params.get('result')!);
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
        const params = new URLSearchParams();
        params.set('status', status);
        // TODO: Improve encoding
        params.set('result', JSON.stringify(result));
        params.set('id', state.id.toString());
        // TODO: what if it already includes a query string
        return `${state.returnURL}?${params.toString()}`;
    }

    public static prepareRedirectInvocation(targetURL: string, id: number,
                                            returnURL: string, command: string,
                                            args: any[]): string {
        const params = new URLSearchParams();
        params.set('id', id.toString());
        params.set('returnURL', returnURL);
        params.set('command', command);

        if (Array.isArray(args)) {
            params.set('args', JSON.stringify(args));
        }

        // TODO: what if it already includes a query string
        return `${targetURL}?${params.toString()}`;
    }
}

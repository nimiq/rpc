class UrlRpcEncoder {
    /**
     * @param {URL|Location} url
     * @return {{origin:string, data:{id:number, command:string, args:*}, returnURL:string}|null}
     */
    static receiveRedirectCommand(url) {
        // Need referrer for origin check
        if (!document.referrer) return null;

        // Parse query
        const params = new URLSearchParams(url.search || url.searchParams);
        const referrer = new URL(document.referrer);

        // Ignore messages without a command
        if (!params.has('command')) return null;

        // Ignore messages without an ID
        if (!params.has('id')) return null;

        // Ignore messages without a valid return path
        if (!params.has('returnURL')) return null;

        // Only allow returning to same origin
        const returnURL = new URL(params.get('returnURL'));
        if (returnURL.origin !== referrer.origin) return null;

        // Parse args
        // TODO: Improve encoding
        let args = [];
        if (params.has('args')) {
            try {
                args = JSON.parse(params.get('args'));
            } catch(e) {
                // Do nothing
            }
        }
        args = Array.isArray(args) ? args : [];

        return {
            origin: referrer.origin,
            data: {
                id: parseInt(params.get('id')),
                command: params.get('command'),
                args: args,
            },
            returnURL: params.get('returnURL'),
        };
    }

    /**
     * @param {URL|Location} url
     * @return {{origin:string, data:{id:number, status:string, result:*}}}
     */
    static receiveRedirectResponse(url) {
        // Need referrer for origin check
        if (!document.referrer) return null;

        // Parse query
        const params = new URLSearchParams(url.search || url.searchParams);
        const referrer = new URL(document.referrer);

        // Ignore messages without a status
        if (!params.has('status')) return null;

        // Ignore messages without an ID
        if (!params.has('id')) return null;

        // Ignore messages without a result
        if (!params.has('result')) return null;

        // Parse result
        // TODO: Improve encoding
        const result = JSON.parse(params.get('result'));

        return {
            origin: referrer.origin,
            data: {
                id: parseInt(params.get('id')),
                status: params.get('status'),
                result: result,
            },
        };
    }

    /**
     * @param {State} state
     * @param {string} status
     * @param {any} result
     * @return {string}
     */
    static prepareRedirectReply(state, status, result) {
        const params = new URLSearchParams();
        params.set('status', status);
        // TODO: Improve encoding
        params.set('result', JSON.stringify(result));
        params.set('id', state.id.toString());
        // TODO: what if it already includes a query string
        return `${state.returnURL}?${params.toString()}`;
    }

    /**
     * @param {string} targetURL
     * @param {number} id
     * @param {string} returnURL
     * @param {string} command
     * @param {any[]} [args]
     * @return {string}
     */
    static prepareRedirectInvocation(targetURL, id, returnURL, command, args) {
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

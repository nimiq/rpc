/*
 * The demo requires the project root to be served as http://rpc.local/.
 * The Server needs to be able to receive POST data.
 * The POST response is not printed anywhere, but can be investigated in the header.
 * The project then needs to be build to test changes, as the demos use the ./dist/ folder.
 * It is strongly advised to play around with the different CallOptions after changes are made,
 * as not all of the combinations are represented.
 *
 * For testing purposes ../src/main.ts must furthermore have an additional export:
 * export * from './UrlRpcEncoder';
 */
class DemoClient {
    constructor() {
        this._connected = this._startIFrame();
        this._redirectClient = new Rpc.RedirectRpcClient('http://rpc.local/demo/second.html', DemoClient.DEMO_ORIGIN);

        this._redirectClient.onResponse(
            'test',
            (result, id, state) => console.log('RESULT:', result, id, state),
            (result, id, state) => console.error('RESULT:', result, id, state),
        );
        this._redirectClient.init().then(() => {});
    }

    async testIFrame(arg) {
        await this._connected;
        return this.iframeClient.call('iFrameTest', [arg]);
    }

    async testPopup(arg) {
        return this._startPopup('test', [arg]);
    }

    async testPopupWitUrlParams(arg) {
        return this._startPopupUrlParams('test', [arg]);
    }

    async testRedirect(arg, useCallOptions) {
        const searchPos = window.location.href.indexOf('?');
        return this._redirectClient.call(
            searchPos >= 0 ? window.location.href.substr(0, searchPos) : window.location.href,
            'test',
            useCallOptions ? {} : undefined,
            [arg],
        );
    }

    async testPostRedirect(arg, useCallOptions) {
        const searchPos = window.location.href.indexOf('?');
        return this._redirectClient.call(
            searchPos >= 0 ? window.location.href.substr(0, searchPos) : window.location.href,
            'test',
            // only exist as CallOption version
            useCallOptions ? { responseMethod: Rpc.ResponseMethod.POST } : undefined,
            [arg],
        );
    }

    async testRedirectWithState(arg, useCallOptions) {
        const searchPos = window.location.href.indexOf('?');
        if (useCallOptions) {
            return this._redirectClient.call(
                searchPos >= 0 ? window.location.href.substr(0, searchPos) : window.location.href,
                'test',
                { state: { testSate: 'This is a test state' } },
                [arg],
            );
        } else {
            return this._redirectClient.callAndSaveLocalState(
                searchPos >= 0 ? window.location.href.substr(0, searchPos) : window.location.href,
                { testState: 'This is a test state' },
                'test',
                undefined,
                [arg],
            )
        }
    }

    /* PRIVATE METHODS */

    /**
     * @returns {Promise<void>}
     */
    async _startIFrame() {
        const $iframe = await this._createIframe();
        if (!$iframe.contentWindow) throw new Error(`IFrame contentWindow is ${typeof $iframe.contentWindow}`);
        this._iframeClient = new Rpc.PostMessageRpcClient($iframe.contentWindow, DemoClient.DEMO_ORIGIN);
        await this._iframeClient.init();
    }

    /**
     * @returns {Promise<HTMLIFrameElement>}
     */
    async _createIframe() {
        return new Promise((resolve, reject) => {
            const $iframe = document.createElement('iframe');
            $iframe.name = 'IFrame';
            $iframe.style.display = 'none';
            document.body.appendChild($iframe);
            $iframe.src = 'second.html';
            $iframe.onload = () => resolve($iframe);
            $iframe.onerror = reject;
        });
    }

    /**
     * @param {string} requestName - The request name in kebab-case (folder name)
     * @param {...*} [args]
     */
    async _startPopup(requestName, ...args) {
        const requestUrl = 'second.html';

        const $popup = window.open(
            requestUrl,
            'DemoPopup',
            `left=${window.innerWidth / 2 - 250},top=100,width=500,height=820,location=yes,dependent=yes`,
        );

        if (!$popup) {
            throw new Error('Popup could not be opened.');
        }

        // Await popup loaded
        await new Promise(res => { $popup.onload = res; });

        const rpcClient = new Rpc.PostMessageRpcClient($popup, DemoClient.DEMO_ORIGIN);
        await rpcClient.init();

        try {
            const result = await rpcClient.call(requestName, ...args);
            rpcClient.close();
            $popup.close();
            return result;
        } catch (e) {
            rpcClient.close();
            $popup.close();
            throw e;
        }
    }

    /**
     * @param {string} requestName - The request name in kebab-case (folder name)
     * @param {...*} [args]
     */
    async _startPopupUrlParams(requestName, ...args) {
        const requestUrl = 'http://rpc.local/demo/second.html';

        const requestURL = new URL(Rpc.UrlRpcEncoder.prepareRedirectInvocation(
            requestUrl,
            100,
            'http://rpc.local/demo/index.html',
            requestName,
            [args],
            Rpc.ResponseMethod.MESSAGE));

        const $popup = window.open(
            requestURL.href,
            'DemoPopup',
            `left=${window.innerWidth / 2 - 250},top=100,width=500,height=820,location=yes,dependent=yes`,
        );

        if (!$popup) {
            throw new Error('Popup could not be opened.');
        }

        // Await popup loaded
        await new Promise(res => { $popup.onload = res; });

        const rpcClient = new Rpc.PostMessageRpcClient($popup, DemoClient.DEMO_ORIGIN);
        await rpcClient.init();
    }

    /** @type {PostMessageRpcClient} */
    get iframeClient() {
        if (!this._iframeClient) throw new Error('IFrame not available');
        return this._iframeClient;
    }
}
DemoClient.DEMO_ORIGIN = '*';

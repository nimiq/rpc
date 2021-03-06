/*
 * Start the demo environment by running `yarn dev` or `npm run dev`.
 */
class DemoClient {
    constructor() {
        this._connected = this._startIFrame();
        this._redirectClient = new Rpc.RedirectRpcClient(location.origin + '/demo/second.html', DemoClient.DEMO_ORIGIN);

        this._redirectClient.onResponse(
            'test',
            (result, id, state) => console.log('RESULT:', result, id, state),
            (result, id, state) => console.error('RESULT:', result, id, state),
        );
        this._redirectClient.init();
    }

    async testIFrame(arg) {
        await this._connected;
        return this.iframeClient.call('iFrameTest', [arg]);
    }

    async testPopup(arg) {
        return this._startPopup('test', [arg]);
    }

    async testRedirect(arg, useCallOptions) {
        return this._redirectClient.call(
            this._getReturnUrl(),
            'test',
            useCallOptions ? {} : undefined,
            [arg],
        );
    }

    async testPostRedirect(arg) {
        return this._redirectClient.call(
            location.origin + '/post',
            'test',
            // only exist as CallOption version
            { responseMethod: Rpc.ResponseMethod.HTTP_POST },
            [arg],
        );
    }

    async testRedirectWithState(arg, useCallOptions) {
        if (useCallOptions) {
            return this._redirectClient.call(
                this._getReturnUrl(),
                'test',
                { state: { testSate: 'This is a test state' } },
                [arg],
            );
        } else {
            return this._redirectClient.callAndSaveLocalState(
                this._getReturnUrl(),
                { testState: 'This is a test state' },
                'test',
                undefined,
                [arg],
            )
        }
    }

    /* PRIVATE METHODS */

    _getReturnUrl() {
        const searchPos = window.location.href.indexOf('?');
        return searchPos >= 0 ? window.location.href.substr(0, searchPos) : window.location.href;
    }

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

    /** @type {PostMessageRpcClient} */
    get iframeClient() {
        if (!this._iframeClient) throw new Error('IFrame not available');
        return this._iframeClient;
    }
}
DemoClient.DEMO_ORIGIN = '*';

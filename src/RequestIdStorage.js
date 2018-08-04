class RequestIdStorage {
    /**
     * @param {boolean} [storeState=true] Whether to store state in sessionStorage
     */
    constructor(storeState = true) {
        this._store = storeState ? window.sessionStorage : null;
        this._validIds = new Map();
        if (storeState) {
            this._restoreIds();
        }
    }

    _restoreIds() {
        const requests = this._store.getItem(RequestIdStorage.KEY);
        if (requests) {
            // TODO: Improve encoding
            this._validIds = new Map(JSON.parse(requests));
        }
    }

    /**
     * @param {number} id
     * @return {boolean}
     */
    has(id) {
        return this._validIds.has(id);
    }

    /**
     * @param {number} id
     * @return {?string}
     */
    getCommand(id) {
        const result = this._validIds.get(id);
        return result ? result[0] : null;
    }

    /**
     * @param {number} id
     * @return {?string}
     */
    getState(id) {
        const result = this._validIds.get(id);
        return result ? result[1] : null;
    }

    /**
     * @param {number} id
     * @param {string} command
     * @param {?string} [state]
     */
    add(id, command, state = null) {
        this._validIds.set(id, [command, state]);
        // TODO: Improve encoding
        if (this._store) {
            this._store.setItem(RequestIdStorage.KEY, JSON.stringify([...this._validIds]));
        }
    }

    /**
     * @param {number} id
     */
    remove(id) {
        this._validIds.delete(id);
        // TODO: Improve encoding
        if (this._store) {
            this._store.setItem(RequestIdStorage.KEY, JSON.stringify([...this._validIds]));
        }
    }

    clear() {
        this._validIds.clear();
        if (this._store) {
            this._store.removeItem(RequestIdStorage.KEY);
        }
    }
}
RequestIdStorage.KEY = 'rpcRequests';

class RequestIdStorage {
    public static readonly KEY = 'rpcRequests';
    private readonly _store: Storage | null;
    private _validIds: Map<number|string, [string, string|null]>;

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

    public _restoreIds() {
        const requests = this._store!.getItem(RequestIdStorage.KEY);
        if (requests) {
            // TODO: Improve encoding
            this._validIds = new Map(JSON.parse(requests));
        }
    }

    public has(id: number|string) {
        return this._validIds.has(id);
    }

    public getCommand(id: number|string) {
        const result = this._validIds.get(id);
        return result ? result[0] : null;
    }

    public getState(id: number|string) {
        const result = this._validIds.get(id);
        return result ? result[1] : null;
    }

    public add(id: number, command: string, state: string|null = null) {
        this._validIds.set(id, [command, state]);
        // TODO: Improve encoding
        if (this._store) {
            this._store.setItem(RequestIdStorage.KEY, JSON.stringify([...this._validIds]));
        }
    }

    public remove(id: number|string) {
        this._validIds.delete(id);
        // TODO: Improve encoding
        if (this._store) {
            this._store.setItem(RequestIdStorage.KEY, JSON.stringify([...this._validIds]));
        }
    }

    public clear() {
        this._validIds.clear();
        if (this._store) {
            this._store.removeItem(RequestIdStorage.KEY);
        }
    }
}

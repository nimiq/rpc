import {JSONUtils} from './JSONUtils';
import { ObjectType } from './ObjectType';

export class RequestIdStorage {
    public static readonly KEY = 'rpcRequests';

    private static _decodeIds(ids: string) {
        const obj = JSONUtils.parse(ids);
        const validIds = new Map();
        for (const key of Object.keys(obj)) {
            const integerKey = parseInt(key, 10);
            validIds.set(isNaN(integerKey) ? key : integerKey, obj[key]);
        }
        return validIds;
    }
    private readonly _store: Storage | null;
    private _validIds: Map<number|string, [string, ObjectType | null]>;

    /**
     * @param storeState Whether to store state in sessionStorage
     */
    constructor(storeState = true) {
        this._store = storeState ? window.sessionStorage : null;
        this._validIds = new Map();
        if (storeState) {
            this._restoreIds();
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

    public add(id: number, command: string, state: ObjectType | null = null) {
        this._validIds.set(id, [command, state]);
        this._storeIds();
    }

    public remove(id: number|string) {
        this._validIds.delete(id);
        this._storeIds();
    }

    public clear() {
        this._validIds.clear();
        if (this._store) {
            this._store.removeItem(RequestIdStorage.KEY);
        }
    }

    private _encodeIds() {
        const obj: any = Object.create(null);
        for (const [key, value] of this._validIds) {
            obj[key] = value;
        }
        return JSONUtils.stringify(obj);
    }

    private _restoreIds() {
        const requests = this._store!.getItem(RequestIdStorage.KEY);
        if (requests) {
            this._validIds = RequestIdStorage._decodeIds(requests);
        }
    }

    private _storeIds() {
        if (this._store) {
            this._store.setItem(RequestIdStorage.KEY, this._encodeIds());
        }
    }
}

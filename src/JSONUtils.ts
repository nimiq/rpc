import {Base64} from './Base64.js';

enum ExtraJSONTypes {
    UINT8_ARRAY,
}

export class JSONUtils {

    public static stringify(value: any) {
        return JSON.stringify(value, JSONUtils._jsonifyType);
    }

    public static parse(value: string) {
        return JSON.parse(value, JSONUtils._parseType);
    }
    private static readonly TYPE_SYMBOL: string = '__';
    private static readonly VALUE_SYMBOL: string = 'v';

    private static _parseType(key: any, value: any) {
        if (value && value.hasOwnProperty &&
            value.hasOwnProperty(JSONUtils.TYPE_SYMBOL) && value.hasOwnProperty(JSONUtils.VALUE_SYMBOL)) {
            switch (value[JSONUtils.TYPE_SYMBOL]) {
                case ExtraJSONTypes.UINT8_ARRAY:
                    return Base64.decode(value[JSONUtils.VALUE_SYMBOL]);
            }
        }
        return value;
    }

    private static _jsonifyType(key: any, value: any) {
        if (value instanceof Uint8Array) {
            return JSONUtils._typedObject(ExtraJSONTypes.UINT8_ARRAY, Base64.encode(value));
        }
        return value;
    }

    private static _typedObject(type: ExtraJSONTypes, value: any) {
        const obj: any = {};
        obj[JSONUtils.TYPE_SYMBOL] = type;
        obj[JSONUtils.VALUE_SYMBOL] = value;
        return obj;
    }
}

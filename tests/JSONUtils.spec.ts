import {JSONUtils} from "../src/JSONUtils";

describe('JSONUtils', () => {
    it('stringify and parse yield the identity', () => {
        const id = (obj: any) => JSONUtils.parse(JSONUtils.stringify(obj));
        const testId = (obj: any) => expect(id(obj)).toEqual(obj);

        testId({test:1});
        testId({abc:'abc'});
        testId({test:[1,2,3]});
        testId({abc:{test:[1,2,3]}});
        testId({abc:new Uint8Array(10)});
    });
});

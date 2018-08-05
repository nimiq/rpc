import {Base64} from "../src/Base64";

class BufferUtils {
    public static toAscii(buffer: Uint8Array) {
        return String.fromCharCode.apply(null, new Uint8Array(buffer));
    }

    public static fromAscii(string: string) {
        const buf = new Uint8Array(string.length);
        for (let i = 0; i < string.length; ++i) {
            buf[i] = string.charCodeAt(i);
        }
        return buf;
    }
}

describe('Base64', () => {
    it('has encode and decode methods', () => {
        expect(Base64.encode(Base64.decode('dGVzdA=='))).toEqual('dGVzdA==');
    });

    it('has encodeUrl and decodeUrl methods', () => {
        expect(Base64.encodeUrl(Base64.decodeUrl('A_-gaw..'))).toEqual('A_-gaw..');
    });

    it('encode fulfills RFC 4648 test vectors', () => {
        expect(Base64.encode(BufferUtils.fromAscii(''))).toBe('');
        expect(Base64.encode(BufferUtils.fromAscii('f'))).toBe('Zg==');
        expect(Base64.encode(BufferUtils.fromAscii('fo'))).toBe('Zm8=');
        expect(Base64.encode(BufferUtils.fromAscii('foo'))).toBe('Zm9v');
        expect(Base64.encode(BufferUtils.fromAscii('foob'))).toBe('Zm9vYg==');
        expect(Base64.encode(BufferUtils.fromAscii('fooba'))).toBe('Zm9vYmE=');
        expect(Base64.encode(BufferUtils.fromAscii('foobar'))).toBe('Zm9vYmFy');
    });

    it('decode fulfills RFC 4648 test vectors', () => {
        expect(BufferUtils.toAscii(Base64.decode(''))).toEqual('');
        expect(BufferUtils.toAscii(Base64.decode('Zg=='))).toEqual('f');
        expect(BufferUtils.toAscii(Base64.decode('Zm8='))).toEqual('fo');
        expect(BufferUtils.toAscii(Base64.decode('Zm9v'))).toEqual('foo');
        expect(BufferUtils.toAscii(Base64.decode('Zm9vYg=='))).toEqual('foob');
        expect(BufferUtils.toAscii(Base64.decode('Zm9vYmE='))).toEqual('fooba');
        expect(BufferUtils.toAscii(Base64.decode('Zm9vYmFy'))).toEqual('foobar');
    });
});

export class RandomUtils {
    public static generateRandomId() {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        return array[0];
    }
}

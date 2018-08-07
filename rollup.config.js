// rollup.config.js
export default [
    {
        input: 'build/main.js',
        output: {
            file: 'dist/rpc.common.js',
            format: 'cjs'
        }
    },
    {
        input: 'build/main.js',
        output: {
            file: 'dist/rpc.umd.js',
            format: 'umd',
            name: 'Rpc'
        }
    }
];

module.exports = {
    entry: {
        client: './src/RpcClient.ts',
        server: './src/RpcServer.ts'
    },
    output: {
        filename: '[name].js',
        library: ['RPC', '[name]']
    },
    resolve: {
        extensions: [ '.tsx', '.ts', '.js' ]
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
};

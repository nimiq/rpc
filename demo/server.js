const express = require('express');
const bodyParser = require('body-parser');
const serveStatic = require('serve-static');
const serveIndex = require('serve-index');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

app.post('/post', (request, response) => {
    console.log('POST /post');
    console.dir(request.body);
    response.writeHead(200, {'Content-Type': 'text/html'});
    response.end(`
        Got POST data:<br>
        <br>
        Status: <strong>${request.body.status}</strong><br>
        Result: <strong>${request.body.result}</strong><br>
        RpcId: <strong>${request.body.rpcId}</strong><br>
        <br>
        <em>Data is also logged in server console.</em><br>
        <br>
        <a href="/demo/">Back to Demo</a>
    `);
});

app.use(serveStatic(process.cwd()), serveIndex(process.cwd()));

port = 3030;
app.listen(port);
console.log(`Listening at http://localhost:${port}`);

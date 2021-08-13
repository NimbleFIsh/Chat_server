const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const webSock = new require('ws');
const wss = new webSock.Server({ 'noServer': true });
const fs = require('fs');
const path = require('path');
const server = express();
const jsonParser = express.json();
server.use(cors());

const online = {};
const PORT = '3034';

const pathToUserNames = path.resolve(__dirname, './data/userNames.json');
const pathToHistory = path.resolve(__dirname, './data/history.json');
const pathToExc = path.resolve(__dirname, './data/exception.json');

let userNames = fs.readFileSync(pathToUserNames, 'utf8') !== '' ?
    JSON.parse(fs.readFileSync(pathToUserNames, 'utf8')) : [],
history = fs.readFileSync(pathToHistory, 'utf8') !== '' ?
    JSON.parse(fs.readFileSync(pathToHistory, 'utf8')) : [],
exceptions = fs.readFileSync(pathToExc, 'utf8') !== '' ?
    JSON.parse(fs.readFileSync(pathToExc, 'utf8')) : [
        "0000-0000-0000-0000",
        "1111-1111-1111-1111"
];

function sockConn(ws, id, username) {
    ws.send(JSON.stringify({
        'id': '1111-1111-1111-1111',
        'name': 'Server',
        'message': history,
        'date': new Date().getTime()
    }));
    online[id] = ws;

    const welcomeMessage = JSON.stringify({
        'id': '1111-1111-1111-1111',
        'name': 'Server',
        'message': `Welcome, ${username}!`,
        'date': new Date().getTime()
    })

    for (let client in online) online[client].send(welcomeMessage);
    history.push(welcomeMessage);

    ws.on('message', msg => {
        msg = msg.toString(); // msg - по умолчанию Buffer, перевод в нормальную форму
        for (let client in online) (client !== id) && online[client].send(msg);
        history.push(msg);
    });

    ws.on('close', () => {
        delete online[id];
        for (let client in online)
            online[client].send(JSON.stringify({
                'id': '1111-1111-1111-1111',
                'name': 'Server',
                'message': `User ${username} was disconnected`,
                'date': new Date().getTime()
            }));
    });
}

const wsErr = (ws, err) => ws.close(1003, err);

server.get('/', (req, res) => {
    if (req.headers.connection === 'Upgrade' && req.headers.upgrade === 'websocket') {
        if (req.query.id) {
            const result = userNames.filter(el => el.id === req.query.id && el.name === req.query.name);
            if (result.length > 0) {
                wss.handleUpgrade(req, req.socket, Buffer.alloc(0), ws => sockConn(ws, result[0].id, result[0].name));
            } else wss.handleUpgrade(req, req.socket, Buffer.alloc(0), ws => wsErr(ws, 'Not authorizated, access denied!'));
        } else wss.handleUpgrade(req, req.socket, Buffer.alloc(0), ws => wsErr(ws, 'id not exists in query'));
    }
});

server.post('/', jsonParser, (req, res) => {
    if (req.body.name) {
        let id;
        do {
            id = uuidv4();
        } while (exceptions.includes(id)); // Защита от повторений id и для зарезервированных id

        if (userNames.filter(el => el.name === req.body.name).length === 0) {
            userNames.push({
                'id': id,
                'name': req.body.name
            });
            res.json({ 'id': id });
            exceptions.push(id);
            fs.writeFileSync(pathToUserNames, JSON.stringify(userNames, null, 4));
            fs.writeFileSync(pathToExc, JSON.stringify(exceptions, null, 4));
        } else {
            res.statusCode = 409;
            res.send('User name is already exists');
        }
    } else {
        res.statusCode = 401;
        res.send('User name is empty');
    }
});

server.post('/rm', jsonParser, (req, res) => {
    if (req.body.id) {
        userNames = userNames.filter(el => el.id !== req.body.id);
        exceptions = exceptions.filter(el => el !== req.body.id);
        res.send('Complete');
        fs.writeFileSync(pathToUserNames, JSON.stringify(userNames, null, 4));
        fs.writeFileSync(pathToExc, JSON.stringify(exceptions, null, 4));
    } else res.send('id not exists');
});

server.get('/players', (req, res) => {
    if (req.query.id) res.send(JSON.stringify(userNames.filter(pl => pl.id !== req.query.id).map(el => el.name)));
    else res.send('Id is not exists');
});

function exit() {
    wss.close();
    fs.writeFile(pathToExc, JSON.stringify(exceptions, null, 4), err => {
        if (err) console.error(err);
        fs.writeFile(pathToUserNames, JSON.stringify(userNames, null, 4), err => {
            if (err) console.error(err);
            fs.writeFile(pathToHistory, JSON.stringify(history, null, 4), err => {
                if (err) console.error(err);
                process.exit();
            });
        });
    });
}

['SIGQUIT', 'SIGSTOP', 'SIGTERM', 'SIGUSR2', 'SIGINT'].forEach(died => 
    process.on(died, exit));

server.listen(process.env.port || PORT, () =>
    console.log('Server started on port:', process.env.port || PORT));
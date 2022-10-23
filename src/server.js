const express = require('express');
const https = require('https');
const { readFileSync } = require('fs');
const { WebSocketServer, OPEN } = require('ws');
const path = require('path');

const app = express();
const WEB_PORT = 3000;
const WEBSOCKET_PORT = 8888;

// Certificate and key
const serverCert = readFileSync(path.resolve(__dirname, './../ssl/cert.pem'));
const serverKey = readFileSync(path.resolve(__dirname, './../ssl/cert.key'));

// ==================== EXPRESS SERVER ====================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/upload.html'));
});
// Serve javascript files
app.get('/*.js', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/scripts' + req.originalUrl));
});
app.get('/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/download.html'));
});

https.createServer({cert: serverCert, key: serverKey}, app)
  .listen(WEB_PORT, () => {
    console.log(`App server listening on port ${WEB_PORT}`);
  });

// ==================== WEBSOCKET SIGNALIGN CLIENT ====================

const wsServer = https.createServer({
  cert: serverCert,
  key: serverKey
});
const wss = new WebSocketServer({ server: wsServer });

wss.on('connection', (socket) => {
  console.log('new connection');
  socket.on('message', (data) => {
    try {
      const jsonMessage = JSON.parse(data);
      handleJsonMessage(socket, jsonMessage);
    } catch (error) {
      console.error('failed to handle onmessage', error);
    }
  });

  socket.once('close', () => {
    console.log('socket::close');
  });
}); 

const handleJsonMessage = (socket, jsonMessage) => {
  switch (jsonMessage.action) {
    case 'start':
      console.log(jsonMessage);
      // If the message has not id it is not valid
      if(!jsonMessage.data.id) return;
      // If the id is already used it is not valid
      if(getSocketById(jsonMessage.data.id)) return;
      socket.id = jsonMessage.data.id
      emitMessage(socket, { action: 'start', id: socket.id }); 
      break;
    default: 
      console.log('remote', jsonMessage.data.remoteId);
      if (!jsonMessage.data.remoteId) return;

      const remotePeerSocket = getSocketById(jsonMessage.data.remoteId);

      if (!remotePeerSocket) {
        return console.log('failed to find remote socket with id', jsonMessage.data.remoteId);
      }

      if (jsonMessage.action !== 'offer') {
        delete jsonMessage.data.remoteId;
      } else {
        jsonMessage.data.remoteId = socket.id;
      }

      emitMessage(remotePeerSocket, jsonMessage);
  }
};

const emitMessage = (socket, jsonMessage) => {
  if (socket.readyState === OPEN) {
    socket.send(JSON.stringify(jsonMessage));
  }
};

const getSocketById = (socketId) =>
  Array.from(wss.clients).find((client => client.id === socketId));

wsServer.listen(WEBSOCKET_PORT, () => {
  console.log(`Websocket server listening on port ${WEBSOCKET_PORT}`);
});

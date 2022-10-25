const express = require('express');
const { WebSocketServer, OPEN } = require('ws');

const app = express();
const PORT = process.env.PORT ?? 3000;

// ==================== EXPRESS SERVER ====================
app.use(express.static("../public"))

// ==================== WEBSOCKET SIGNALIGN CLIENT ====================

const wss = new WebSocketServer({ server: app.listen(PORT) });

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
      if (!jsonMessage.data.id) return;
      // If the id is already used it is not valid
      if (getSocketById(jsonMessage.data.id)) return;
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

const express = require('express');
const { Server, OPEN } = require('ws');
const path = require("path")

const app = express();
const PORT = process.env.PORT ?? 3000;

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

// ==================== WEBSOCKET SIGNALIGN CLIENT ====================
const wss = new Server({ server: app.listen(PORT) });

wss.on("listening", () => {
  console.log(`Server listening on ${PORT}`)
})

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


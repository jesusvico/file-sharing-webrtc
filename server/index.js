const { WebSocket, OPEN } = require('ws');

const WEBSOCKET_PORT = 8080;

// ==================== WEBSOCKET SIGNALIGN CLIENT ====================
const wss = new WebSocket.Server({ port: WEBSOCKET_PORT });

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
  let remotePeerSocket;
  console.log(jsonMessage.action);
  switch (jsonMessage.action) {
    case 'start':
      console.log(`Start: ${jsonMessage.data.id}`);
      // If the message has not id it is not valid
      if(!jsonMessage.data.id) return;
      // If the id is already used it is not valid
      if(getSocketById(jsonMessage.data.id)) return;
      socket.id = jsonMessage.data.id
      emitMessage(socket, { action: 'start', id: socket.id }); 
      break;

    case 'offer':
      console.log('Offer:', jsonMessage.data.remoteId);
      console.log(jsonMessage.data);
      if (!jsonMessage.data.remoteId) return;

      remotePeerSocket = getSocketById(jsonMessage.data.remoteId);

      if (!remotePeerSocket) {
        return console.log('failed to find remote socket with id', jsonMessage.data.remoteId);
      }
      jsonMessage.data.remoteId = socket.id;

      emitMessage(remotePeerSocket, jsonMessage);
      break;

    default: 
      console.log('remote', jsonMessage.data.remoteId);
      console.log(jsonMessage.data);
      if (!jsonMessage.data.remoteId) return;

      remotePeerSocket = getSocketById(jsonMessage.data.remoteId);

      if (!remotePeerSocket) {
        return console.log('failed to find remote socket with id', jsonMessage.data.remoteId);
      }

      delete jsonMessage.data.remoteId;

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

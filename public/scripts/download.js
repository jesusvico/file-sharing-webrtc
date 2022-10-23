import {generateKey, keyToString, getPeerId, sendMessage} from '/utils.js';

let peerConnection, dataChannel, remoteId;
let privateKey, privateKeyString, peerId;
let fileName, downloadedMessage = [];

// ==================== WEBSOCKET ====================
const socket = new WebSocket('wss://localhost:8888');

socket.onopen = () => {
  console.log('socket::open');
};

socket.onmessage = async ({ data }) => {
  try {
    const jsonMessage = JSON.parse(data);
    console.log('action', jsonMessage.action);
    switch (jsonMessage.action) {
      case 'start':
        console.log('start', jsonMessage.id);
        break;
      case 'offer':
        remoteId = jsonMessage.data.remoteId;
        delete jsonMessage.data.remoteId;

        await initializePeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(jsonMessage.data.offer));

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        sendSocketMessage('answer', { remoteId, answer }); 
        break;
      case 'answer':
        await peerConnection.setRemoteDescription(new RTCSessionDescription(jsonMessage.data.answer));
        break;
      case 'iceCandidate':
        await peerConnection.addIceCandidate(jsonMessage.data.candidate);
        break;
      default: console.warn('unknown action', jsonMessage.action);
    }
  } catch (error) {
    console.error('failed to handle socket message', error);
  }
};

socket.onerror = (error) => {
  console.error('socket::error', error);
};

socket.onclose = () => {
  console.log('socket::close');
  stop();
};

const sendSocketMessage = (action, data) => {
  const message = { action, data };
  socket.send(JSON.stringify(message));
}

// ==================== LISTENER ====================

document.getElementById('downloadButton').addEventListener('click', async () => {

  privateKey = await generateKey();
  privateKeyString = keyToString(privateKey);
  peerId = await getPeerId(privateKeyString);

  remoteId = window.location.pathname.replace('/', '');

  sendSocketMessage('start', { id: peerId });
  await call();
});

const call = async () => {
  try {    
    if (!remoteId) {
      alert('Please enter a remote id');
      
      return;
    }

    console.log('call: ', remoteId);
    await initializePeerConnection();
    initializeDataChannel();

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    sendSocketMessage('offer', { offer, remoteId });
  } catch (error) {
    console.error('failed to initialize call', error);
  }
};

const stop = () => {
  for (const sender of peerConnection.getSenders()) {
    sender.track.stop();
  }

  dataChannel.close();
  peerConnection.close();
};

const initializePeerConnection = async (mediaTracks) => {
  const config = { iceServers: [{ urls: [ 'stun:stun1.l.google.com:19302' ] } ] };
  peerConnection = new RTCPeerConnection(config);

  peerConnection.onicecandidate = ({ candidate }) => {
    if (!candidate) return;

    console.log('peerConnection::icecandidate', candidate);
    console.log('remote', remoteId);
    sendSocketMessage('iceCandidate', { remoteId, candidate });
  };

  peerConnection.oniceconnectionstatechange = () => {
    console.log('peerConnection::iceconnectionstatechange newState=', peerConnection.iceConnectionState);
    // If ICE state is disconnected stop
    if (peerConnection.iceConnectionState === 'disconnected') {
      alert('Connection has been closed stopping...');
      socket.close();
    }
  };

  peerConnection.ondatachannel = ({ channel }) => {
    console.log('peerConnection::ondatachannel');
    dataChannel = channel;

    initializeDataChannelListeners();
  };
};

const initializeDataChannel = () => {
  const config = { ordered: true };

  dataChannel = peerConnection.createDataChannel('dataChannel', config);
  initializeDataChannelListeners();
};

const initializeDataChannelListeners = () => {
  dataChannel.onopen = () => console.log('dataChannel started');
  dataChannel.onclose = () => console.log('dataChannel closed');
  dataChannel.onerror = (error) => console.error('dataChannel error:', error);

  dataChannel.onmessage = ({ data }) => {
    
    let jsonData = JSON.parse(data);
    switch(jsonData.type) {
      case "name":
        fileName = jsonData.data;
        break;
      case "chunk":
        downloadedMessage.push(jsonData.data);
        break;
      case "finish":
        saveToDisk(downloadedMessage.join(''), fileName);
        fileName = "";
        downloadedMessage = [];
        break;
      default:
        console.log('dataChannel received: ', jsonData);
    }

  };
};

const saveToDisk = (fileUrl, fileName) => {
  var save = document.createElement('a');
  save.href = fileUrl;
  save.target = '_blank';
  save.download = fileName || fileUrl;

  save.click();
  (window.URL || window.webkitURL).revokeObjectURL(save.href);
}
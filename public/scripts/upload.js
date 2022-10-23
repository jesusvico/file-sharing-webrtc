import {generateKey, keyToString, getPeerId} from '/utils.js';

let peerConnection, dataChannel, remoteId;
let privateKey, privateKeyString, peerId;

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

document.getElementById('startButton').addEventListener('click', async () => {
  document.getElementById('startButton').disabled = true;

  privateKey = await generateKey();
  privateKeyString = keyToString(privateKey);
  peerId = await getPeerId(privateKeyString);
  
  sendSocketMessage('start', { id: peerId });

  document.getElementById('downloadUrl').innerHTML = window.location.href + peerId;
  document.getElementById('downloadUrl').href = window.location.href + peerId;
});

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

const initializeDataChannelListeners = () => {
  dataChannel.onopen = () => uploadFile();
  dataChannel.onclose = () => console.log('dataChannel closed');
  dataChannel.onerror = (error) => console.error('dataChannel error:', error);
  dataChannel.onmessage = ({ data }) => console.log('dataChannel data: ', data);
};

const uploadFile = () => {
  let file = document.getElementById('file').files[0];
  if(!file) return;
  console.log(file);

  let reader = new FileReader();
  reader.readAsDataURL(file);

  reader.onload = () => {
    // Send file name
    dataChannel.send(JSON.stringify({ type: "name", data: file.name }));

    const chunkSize = 1000;
    for (let i = 0; i < reader.result.length; i += chunkSize) {
      const chunk = reader.result.slice(i, i + chunkSize);
      dataChannel.send(JSON.stringify({ type: "chunk", data: chunk }));
    }
    dataChannel.send(JSON.stringify({ type: "finish" }));
  };

  reader.onerror = () => {
    console.log(reader.error);
  };
}
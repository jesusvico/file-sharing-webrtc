import { generateKeyPair, getPeerId, getRandomBytes, uint8ArrayToString, stringToUint8Array, signRandoms, getPeerIdFromRaw, verifySignature } from '/utils.js';

const WEBSOCKET_PORT = 8080;
let peerConnection, dataChannel, remoteId;
let keyPair, peerId;

let remotePublicKey, localRandom, remoteRandom;

let wsInterval;
let sendButton = document.getElementById('send-button');
let copyButton = document.getElementById('copy-clipboard');
let sending = false;

let fileName, downloadedMessage = [], fileData, initStatus;
let progressBar = document.getElementById('progress');
// ==================== WEBSOCKET ====================
let socket;

const socketOnOpen = () => {
  console.log('Websocket OPEN');
  console.log('SEND ACTION: start ' + peerId);
  sendSocketMessage('start', { id: peerId });
  sendButton.disabled = true;

  // Keep he socket alive
  wsInterval = setInterval(() => sendSocketMessage('ping', 'ping'), 1000 * 60);
}

const socketOnMessage = async ({ data }) => {
  try {
    const jsonMessage = JSON.parse(data);
    switch (jsonMessage.action) {
      case 'start':
        console.log('RECEIVE ACTION: start ' + jsonMessage.id);
        if (jsonMessage.id !== peerId) console.error('Invalid id');
        break;
      case 'offer':
        console.log('RECEIVE ACTION: offer ' + jsonMessage.data.remoteId);
        remoteId = jsonMessage.data.remoteId;
        delete jsonMessage.data.remoteId;

        // If we have a dataChannel ignore the new one
        if (dataChannel) break;
        await initializePeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(jsonMessage.data.offer));

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        sendSocketMessage('answer', { remoteId, answer });
        break;
      case 'answer':
        console.log('RECEIVE ACTION: answer ' + jsonMessage.data.answer);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(jsonMessage.data.answer));
        break;
      case 'iceCandidate':
        console.log('RECEIVE ACTION: iceCandidate ' + jsonMessage.data.candidate);
        await peerConnection.addIceCandidate(jsonMessage.data.candidate);
        break;
      default: console.log('RECEIVE ACTION: unknown action ' + jsonMessage.action);
    }
  } catch (error) {
    console.error('failed to handle socket message', error);
  }
};

const socketOnError = (error) => {
  console.error('socket::error', error);
};

const socketOnClose = () => {
  console.log('socket::close');
  stop();
  sendButton.disabled = false;
  clearInterval(wsInterval);
};

const start = async () => {
  // If there is no keyPair generate it
  if (!keyPair) {
    keyPair = await generateKeyPair();
    console.log(keyPair);
    peerId = await getPeerId(keyPair.publicKey);
  }

  socket = new WebSocket(`wss://${window.location.hostname}:${WEBSOCKET_PORT}`);
  socket.onopen = socketOnOpen;
  socket.onmessage = socketOnMessage;
  socket.onerror = socketOnError;
  socket.onclose = socketOnClose;
}

const sendSocketMessage = (action, data) => {
  const message = { action, data };
  socket.send(JSON.stringify(message));
};

// ==================== LISTENERS ====================
sendButton.addEventListener('click', async () => {
  sending = true;
  await start();
  let downloadLink = document.getElementById('download-link');
  downloadLink.href = `https://${window.location.host}/#${peerId}`;
  downloadLink.innerHTML = `https://${window.location.host}/#${peerId}`;
  sendButton.disabled = true;
  copyButton.style.display = 'block';

  document.getElementById('qrcode').innerHTML = "";
  new QRCode(document.getElementById("qrcode"), `https://${window.location.host}/#${peerId}`);
});

copyButton.addEventListener('click', () => {
  navigator.clipboard.writeText(`https://${window.location.host}/#${peerId}`);
})

// ==================== ACTIONS ====================

const addMessage = (message) => {
  let newMessage = document.createElement('div');
  newMessage.innerHTML = message;
  document.getElementById('messages').appendChild(newMessage);
}

// ==================== P2P ====================
const connect = async () => {
  try {
    if (!remoteId) {
      alert('Please enter a remote id');
      return;
    }

    console.log('CONNECTING to: ' + remoteId);
    await initializePeerConnection();
    initializeDataChannel();

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    sendSocketMessage('offer', { offer, remoteId });
  } catch (error) {
    console.error('failed to initialize call', error);
  }
};

const closeConnection = async () => {
  console.log('Data Channel CLOSED');

  dataChannel = null;
  remoteId = null;
  remotePublicKey = null;
  localRandom = null;
  remoteRandom = null;

  document.getElementById('connectionForm').style.display = 'flex';
  document.getElementById('chat').style.display = 'none';
}

const initializeDataChannel = () => {
  const config = { ordered: true };

  dataChannel = peerConnection.createDataChannel('dataChannel', config);
  initializeDataChannelListeners();
};

const initializePeerConnection = async () => {
  const config = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302'] }] };
  peerConnection = new RTCPeerConnection(config);

  peerConnection.onicecandidate = ({ candidate }) => {
    if (!candidate) return;

    console.log('peerConnection icecandidate ' + candidate);
    console.log('remote ' + remoteId);
    sendSocketMessage('iceCandidate', { remoteId, candidate });
  };

  peerConnection.oniceconnectionstatechange = () => {
    console.log('peerConnection::iceconnectionstatechange newState=' + peerConnection.iceConnectionState);
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
  dataChannel.onopen = async () => {
    console.log('Data Channel OPEN')
    // If you are downloading send a random number
    if (!sending) {
      //let rawPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
      //dataChannel.send(JSON.stringify({ type: 'publicKey', data: uint8ArrayToString(rawPublicKey) }));
      localRandom = await getRandomBytes(32);
      dataChannel.send(JSON.stringify({ type: 'random', data: uint8ArrayToString(localRandom) }));
    }
  }
  dataChannel.onclose = () => closeConnection();
  dataChannel.onerror = (error) => error('Data Channel error: ' + error);
  dataChannel.onmessage = async ({ data }) => {
    let jsonData = JSON.parse(data);

    switch (jsonData.type) {

      case 'random':
        remoteRandom = stringToUint8Array(jsonData.data);
        if(sending) {
          // First send random
          localRandom = await getRandomBytes(32);
          dataChannel.send(JSON.stringify({ type: 'random', data: uint8ArrayToString(localRandom) }));
          // Then send the raw public key
          let rawPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
          dataChannel.send(JSON.stringify({ type: 'publicKey', data: uint8ArrayToString(rawPublicKey) }));
          // Then send the signature of both randoms
          let signature = new Uint8Array(await signRandoms(keyPair.privateKey, localRandom, remoteRandom));
          dataChannel.send(JSON.stringify({ type: 'signature', data: uint8ArrayToString(signature) }));
          // Send the file
          uploadFile();
        }
        break;

      case 'publicKey':
        // Check if the remote public key corresponds to the remotePeerId
        console.log('Remote public key', jsonData.data);
        remotePublicKey = stringToUint8Array(jsonData.data);
        let remotePublicKeyId = await getPeerIdFromRaw(remotePublicKey);
        if (remotePublicKeyId != remoteId) {
          console.error('Invalid remote public key');
          dataChannel.close();
          break;
        }
        break;

      case 'signature':
        // Check if the remote signature is valid
        let remoteSignature = stringToUint8Array(jsonData.data);
        let result = await verifySignature(remotePublicKey, remoteSignature.buffer, localRandom, remoteRandom);
        if (!result) {
          console.error('Invalid signature')
          dataChannel.close();
          break;
        }
        console.log('Valid signature');
        break;

      case 'message':
        console.log('Data Channel data: ' + jsonData.data);
        addMessage('Remote: ' + jsonData.data);
        break;

      // Download file cases
      case 'name':
        fileName = jsonData.data;
        break;
      
      case 'chunk':
        downloadedMessage.push(jsonData.data);
        break;

      case 'finish':
        await saveToDisk(downloadedMessage.join(''), fileName);
        break;
      
      case 'status':
        if(!initStatus) initStatus = jsonData.data;
        let status = (1 - jsonData.data / initStatus) * 100;
        progressBar.style.width = `${status}%`;
        break;

      default:
        console.error('Invalid data');
    }
  }
};

const uploadFile = () => {
  const file = window.file;
  if(!file) {
    consoler.error('No file to upload');
  }

  let reader = new FileReader();
  reader.readAsDataURL(file);

  reader.onload = () => {
    // Send file name
    dataChannel.send(JSON.stringify({type: "name", data: file.name}));

    fileData = reader.result;
    // Send file
    sendFile();
  }
}

const sendFile = () => {
  const chunkSize = 10000;
  while(fileData.length) {
    // Wait for the buffer
    if(dataChannel.bufferedAmount > dataChannel.bufferedAmountLowThreshold) {
      dataChannel.onbufferedamountlow = () => {
        dataChannel.onbufferedamountlow = null;
        sendFile();
      };
      return;
    }
    const chunk = fileData.slice(0, chunkSize);
    fileData = fileData.slice(chunkSize, fileData.length);
    dataChannel.send(JSON.stringify({ type: "chunk", data: chunk }));
    dataChannel.send(JSON.stringify({ type: "status", data: fileData.length }));
  }
  if(!fileData.length) {
    dataChannel.send(JSON.stringify({ type: "finish" }));
  }
}

const saveToDisk = async (fileUrl, fileName) => {
  var save = document.createElement('a');
  save.href = fileUrl;
  save.target = '_blank';
  save.download = fileName || fileUrl;

  save.click();
  (window.URL || window.webkitURL).revokeObjectURL(save.href);
}

// Check if we are downloading
if(window.location.hash) {
  remoteId = window.location.hash.replace('#', '');
  await start();
  setTimeout(() => connect(), 1000);
}
import { generateKey, getPeerId, getKeyString, getKeyFromString, encrypt, decrypt, getRandomBytes } from '/utils.js';

const WEBSOCKET_PORT = 8080;
let peerConnection, dataChannel, remoteKey, remotePeerId;
let key, keyString, peerId;

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
        remotePeerId = jsonMessage.data.remoteId;
        delete jsonMessage.data.remoteId;

        // If we have a dataChannel ignore the new one
        if (dataChannel) break;
        await initializePeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(jsonMessage.data.offer));

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        sendSocketMessage('answer', { remoteId: remotePeerId, answer });
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
  if (!key) {
    key = await generateKey();
    keyString = await getKeyString(key);
    console.log(key);
    peerId = await getPeerId(key);
  }
  console.log('Local Peer ID: ', peerId);

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
  let url = `https://${window.location.host}/#${keyString}`;
  let openUrl = document.getElementById('open-url');
  openUrl.onclick = () => window.open(url);
  sendButton.disabled = true;
  copyButton.style.display = 'block';
  openUrl.style.display = 'block';

  document.getElementById('qrcode').innerHTML = "";
  new QRCode(document.getElementById("qrcode"), `https://${window.location.host}/#${keyString}`);
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
    if (!remotePeerId) {
      alert('Please enter a remote id');
      return;
    }

    console.log('CONNECTING to: ' + remotePeerId);
    await initializePeerConnection();
    initializeDataChannel();

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    sendSocketMessage('offer', { offer, remoteId: remotePeerId });
  } catch (error) {
    console.error('failed to initialize call', error);
  }
};

const closeConnection = async () => {
  console.log('Data Channel CLOSED');

  dataChannel = null;
  remotePeerId = null;
  remoteKey = null;
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
    console.log('remote ' + remotePeerId);
    sendSocketMessage('iceCandidate', { remoteId: remotePeerId, candidate });
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
    // If you are the uploader send the encrypted file
    if (sending) {
      // TODO
      uploadFile();
    }
  }
  dataChannel.onclose = () => closeConnection();
  dataChannel.onerror = (error) => error('Data Channel error: ' + error);
  dataChannel.onmessage = async ({ data }) => {
    // If we have the iv all the messages are encrypted
    let plaintext = await decrypt(remoteKey, data);
    let jsonData = JSON.parse(plaintext);

    switch (jsonData.type) {

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
        dataChannel.close();

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

  reader.onload = async () => {    
    let ciphertext = await encrypt(key, JSON.stringify({type: "name", data: file.name}));
    dataChannel.send(ciphertext);

    fileData = reader.result;
    // Send file
    sendFile();
  }
}

const sendFile = async () => {
  const chunkSize = 1000;
  let ciphertext;
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
    console.log('Chunk: ', chunk)
    fileData = fileData.slice(chunkSize, fileData.length);
    ciphertext = await encrypt(key, JSON.stringify({ type: "chunk", data: chunk }));
    dataChannel.send(ciphertext);
    ciphertext = await encrypt (key, JSON.stringify({ type: "status", data: fileData.length }));
    dataChannel.send(ciphertext);
  }
  if(!fileData.length) {
    ciphertext = await encrypt(key, JSON.stringify({ type: "finish" }));
    dataChannel.send(ciphertext);
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
  let remoteStringKey = window.location.hash.replace('#', '');
  console.log(remoteStringKey)
  remoteKey = await getKeyFromString(remoteStringKey);
  remotePeerId = await getPeerId(remoteKey);
  console.log('Remote Peer ID: ', remotePeerId);

  await start();
  setTimeout(() => connect(), 1000);

}
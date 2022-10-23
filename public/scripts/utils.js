// ==================== CRYPTO ====================

export function generateKey() {
  let key = new Uint8Array(32);
  window.crypto.getRandomValues(key);
  return key;
}

export function keyToString(key) {
  let keyString = "";
  key.forEach((value) => {
    let hexValue = value.toString(16);
    while (hexValue.length < 2) hexValue = '0' + hexValue;
    keyString += hexValue
  });
  return keyString;
}

export async function getPeerId(keyString) {
  return (await sha256(keyString)).substring(0, 40);
}

export async function sha256(message) {
  // encode as UTF-8
  const msgBuffer = new TextEncoder().encode(message);

  // hash the message
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);

  // convert ArrayBuffer to Array
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  // convert bytes to hex string                  
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// ==================== COMMUNICATION ====================

export function sendMessage(dataChannel, type, data) {
  if (!type) {
    alert('no message entered');
    return;
  }

  if (!dataChannel || dataChannel.readyState !== 'open') {
    alert('data channel is undefined or is not connected');
    return;
  }

  let message = {
    type: type,
    data: data
  }
  
  console.log('sending message', message);

  dataChannel.send(JSON.stringify(message));
  document.getElementById('chatMessage').value = '';
};
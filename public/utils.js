/*
  Cryptographic mechanism:
    1. Generate a ECDSA keypair. The public key is your localPeerId.
    2. Send the localPeerId to the user you want to connect.
    3. When both users are connected, they must verify that the other user is the real
      owner of the peerId. To achieve this, we need a proof of ownership.
    4. Since WebRTC data channels are encrypted using DTLS, the connection is already safe.
*/

// ==================== CRYPTO ====================

// Get random values, returns an ArrayBuffer
export function getRandomBytes(size) {
  const buf = new Uint8Array(size);
  crypto.getRandomValues(buf);
  return buf.buffer;
}

// Generate symmetric key
export async function generateKey() {
  const algorithm = {
    name: 'AES-GCM',
    length: '256'
  }
  const keyUsages = ['encrypt', 'decrypt'];
  const key = await crypto.subtle.generateKey(algorithm, true, keyUsages);
  
  return key;
}

export async function getKeyString(key) {
  let rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  let stringRawKey = uint8ArrayToHexString(rawKey);
  return stringRawKey;
}

export async function getKeyFromString(stringKey) {
  const algorithm = {
    name: 'AES-GCM',
    length: '256'
  }
  const keyUsages = ['encrypt', 'decrypt'];

  const rawKey = hexStringToUint8Array(stringKey);

  let key = await crypto.subtle.importKey('raw', rawKey, algorithm, true, keyUsages);
  return key;
}

export async function getPeerId(key) {
  let rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  let stringRawKey = uint8ArrayToHexString(rawKey);

  return (await sha256(stringRawKey)).substring(0, 40);
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

export async function encrypt(key, plaintextString) {
  const plaintext = stringToArrayBuffer(plaintextString);
  const iv = getRandomBytes(16);
  console.log(iv)

  const algorithm = {
    name: 'AES-GCM',
    iv: iv
  }

  let ciphertext = await crypto.subtle.encrypt(algorithm, key, plaintext);

  // Concat iv and ciphertext
  let result = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  result.set(new Uint8Array(iv), 0);
  result.set(new Uint8Array(ciphertext), iv.byteLength);

  return result;
}

export async function decrypt(key, value) {
  let iv = value.slice(0, 16);
  let ciphertext = value.slice(16);

  const algorithm = {
    name: 'AES-GCM',
    iv: iv
  }

  let plaintext = await crypto.subtle.decrypt(algorithm, key, ciphertext);
  plaintext = arrayBufferToString(plaintext);
  return plaintext;
}



// Uint8Array ----> HexString
export function uint8ArrayToHexString(u8array) {
  let str = "";
  u8array.forEach((value) => {
    let hexValue = value.toString(16);
    while (hexValue.length < 2) hexValue = '0' + hexValue;
    str += hexValue
  });
  return str;
}

// Uint8Array <---- HexString
export function hexStringToUint8Array(hexString) {
  return Uint8Array.from(hexString.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
}

// ArrayBuffer ----> String
export function arrayBufferToString(buf) {
  return String.fromCharCode.apply(null, new Uint16Array(buf));
}

// ArrayBuffer <---- String
export function stringToArrayBuffer(str) {
  var buf = new ArrayBuffer(str.length*2); // 2 bytes for each char
  var bufView = new Uint16Array(buf);
  for (var i=0, strLen=str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}
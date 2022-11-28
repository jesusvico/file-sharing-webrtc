/*
  Cryptographic mechanism:
    1. Generate a ECDSA keypair. The public key is your localPeerId.
    2. Send the localPeerId to the user you want to connect.
    3. When both users are connected, they must verify that the other user is the real
      owner of the peerId. To achieve this, we need a proof of ownership.
    4. Since WebRTC data channels are encrypted using DTLS, the connection is already safe.
*/

// ==================== CRYPTO ====================

export async function generateKeyPair() {
  const algorithm = {
    name: 'ECDSA',
    namedCurve: 'P-256'
  }
  const keyUsages = ['sign', 'verify'];
  const key = await crypto.subtle.generateKey(algorithm, true, keyUsages);
  
  return key;
}

export function uint8ArrayToString(u8array) {
  let str = "";
  u8array.forEach((value) => {
    let hexValue = value.toString(16);
    while (hexValue.length < 2) hexValue = '0' + hexValue;
    str += hexValue
  });
  return str;
}

export function stringToUint8Array(hexString) {
  return Uint8Array.from(hexString.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
}

export async function getPeerId(publicKey) {
  let rawPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
  let stringPublicKey = uint8ArrayToString(rawPublicKey);
  console.log('Raw local public key:', stringPublicKey);

  return (await sha256(stringPublicKey)).substring(0, 40);
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


/* HANDSHAKE SIGNATURE */

export async function getPeerIdFromRaw(rawPublicKey) {
  let stringPublicKey = uint8ArrayToString(rawPublicKey);
  console.log(stringPublicKey);

  return (await sha256(stringPublicKey)).substring(0, 40);
}

export async function getRandomBytes(length) {
  let randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  return randomBytes;
}

export async function signRandoms(privateKey, random1, random2) {
  let randoms = new Uint8Array(random1.length + random2.length);
  if(random1 > random2) {
    randoms.set(random1);
    randoms.set(random2, random1.length)
  } else {
    randoms.set(random2);
    randoms.set(random1, random2.length)
  }

  let algorithm = {
    name: 'ECDSA',
    hash: 'SHA-512'
  }
  return await crypto.subtle.sign(algorithm, privateKey, randoms.buffer);
}

export async function verifySignature(rawPublicKey, signature, random1, random2) {
  let randoms = new Uint8Array(random1.length + random2.length);
  if(random1 > random2) {
    randoms.set(random1);
    randoms.set(random2, random1.length)
  } else {
    randoms.set(random2);
    randoms.set(random1, random2.length)
  }

  let algorithmKey = {
    name: 'ECDSA',
    namedCurve: 'P-256'
  }
  let publicKey = await crypto.subtle.importKey('raw', rawPublicKey, algorithmKey, true, ['verify']);

  let algorithVerify = {
    name: 'ECDSA',
    hash: 'SHA-512'
  }
  return await crypto.subtle.verify(algorithVerify, publicKey, signature, randoms);
}
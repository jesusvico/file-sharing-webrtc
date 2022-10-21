let connection = new WebSocket('ws://localhost:9090');
let username = "";

let loginInput = document.getElementById("loginInput");
let loginBtn = document.getElementById("loginBtn");

let otherUsernameInput = document.getElementById("otherUsernameInput");
let connectToOtherUsernameBtn = document.getElementById("connectToOtherUsernameBtn");

let msgInput = document.getElementById("msgInput");
let sendMsgBtn = document.getElementById("sendMsgBtn");

let connectedUser, myConnection, dataChannel;

function send(message) {
  if (connectedUser) {
    message.name = connectedUser;
  }
  connection.send(JSON.stringify(message));
}

// When a user clicks the login button 
loginBtn.addEventListener("click", (event) => {
  username = loginInput.value;
  if (username.length > 0) {
    send({ type: "login", name: username });
  }
});

// Setup a peer connection with another user 
connectToOtherUsernameBtn.addEventListener("click", () => {

  let otherUsername = otherUsernameInput.value;
  connectedUser = otherUsername;
  if (otherUsername.length <= 0) return;
  // Make an offer 
  myConnection.createOffer((offer) => {
    console.log("Offer");
    send({ type: "offer", offer: offer });
    myConnection.setLocalDescription(offer);
  }, (error) => {
    alert("An error has occurred.");
  });
});

// When a user clicks the send message button 
sendMsgBtn.addEventListener("click", (event) => {
  var val = msgInput.value;
  console.log(`Send message: ${val}`);
  dataChannel.send(val);
});

// Handle messages from the server 
connection.onmessage = (message) => {
  console.log("Got message: ", message.data);
  let data = JSON.parse(message.data);

  switch (data.type) {
    case "login":
      onLogin(data.success);
      break;
    case "offer":
      onOffer(data.offer, data.name);
      break;
    case "answer":
      onAnswer(data.answer);
      break;
    case "candidate":
      onCandidate(data.candidate);
      break;
    default:
      break;
  }
};

// When a user logs in 
function onLogin(success) {
  if (success === false) {
    alert("Oops... Try a different username");
    return;
  }
  // Creating our RTCPeerConnection object 
  var configuration = {
    "iceServers": [
      { "urls": "stun:stun.1.google.com:19302" }
    ]
  };

  myConnection = new RTCPeerConnection(configuration);
  console.log("RTCPeerConnection object was created");
  console.log(myConnection);

  // Setup ice handling
  // When the browser finds an ice candidate we send it to another peer 
  myConnection.onicecandidate = (event) => {
    if (event.candidate) {
      send({ type: "candidate", candidate: event.candidate });
    }
  };
  openDataChannel();
};

//when somebody wants to call us 
function onOffer(offer, name) {
  connectedUser = name;
  myConnection.setRemoteDescription(new RTCSessionDescription(offer));

  myConnection.createAnswer((answer) => {
    myConnection.setLocalDescription(answer);
    send({ type: "answer", answer: answer });
  }, (error) => {
    alert("Oops... Error");
  });
}

// When another user answers to our offer 
function onAnswer(answer) {
  myConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

// When we got ice candidate from another user 
function onCandidate(candidate) {
  myConnection.addIceCandidate(new RTCIceCandidate(candidate));
}



connection.onopen = function () {
  console.log("Connected");
};

connection.onerror = function (err) {
  console.log("Got error", err);
};

// Alias for sending messages in JSON format 
function send(message) {
  if (connectedUser) message.name = connectedUser;
  connection.send(JSON.stringify(message));
};

// Creating data channel 
function openDataChannel() {
  dataChannel = myConnection.createDataChannel("myDataChannel");
  console.log(dataChannel);

  dataChannel.onerror = (error) => {
    console.log("Error:", error);
  };

  dataChannel.onmessage = (event) => {
    console.log("Got message: ", event.data);
  };
}
import { WebSocketServer } from 'ws';
import express from 'express';
import path from 'path';

const PORT = 3000;

const app = express();
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile("index.html");
});

app.listen(PORT, () => {
  console.log('Example app listening on port 3000!');
});

function sendTo(connection, message) { 
  connection.send(JSON.stringify(message)); 
}

let wss = new WebSocketServer({ port: 9090 });

// All users connected to the server
let users = {};

//when a user connects to our sever 
wss.on('connection', (connection) => {
  console.log("user connected");

  //when server gets a message from a connected user 
  connection.on('message', (message) => {
    let data;

    //accepting only JSON messages 
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.error("Invalid JSON");
      data = {};
    }

    //switching type of the user message 
    switch (data.type) {
      //when a user tries to login 
      case "login":
        console.log("User logged:", data.name);

        //if anyone is logged in with this username then refuse 
        if (users[data.name]) {sendTo(connection, {type: "login", success: false});
        } else {
          //save user connection on the server 
          users[data.name] = connection;
          connection.name = data.name;
          sendTo(connection, {type: "login", success: true});
        }
        break;
      case "offer":
        //for ex. UserA wants to call UserB 
        console.log(`Sending offer: from ${connection.name} to ${data.name}`);
        //if UserB exists then send him offer details 
        let userOfferConn = users[data.name];
        if(userOfferConn != null){ 
          //setting that UserA connected with UserB 
          connection.otherName = data.name; 
          sendTo(userOfferConn, {type: "offer", offer: data.offer, name: connection.name}); 
        }
        break;
      case "answer":
        console.log(`Sending answer: from ${connection.name} to ${data.name}`);
        //for ex. UserB answers UserA 
        let userAnswerConn = users[data.name];
        if(userAnswerConn != null) { 
          connection.otherName = data.name; 
          sendTo(userAnswerConn, {type: "answer", answer: data.answer}); 
        }
        break;
      case "candidate":
        console.log(`Sending candidate from ${connection.name} to ${data.name}`);
        let userCandidateConn = users[data.name];
        if(userCandidateConn != null) {
          sendTo(userCandidateConn, {type: "candidate", candidate: data.candidate}); 
        }
        break;
      case "leave":
        console.log(`Disconnecting: ${connection.name} & ${data.name}`);
        let userDiscConn = users[data.name];
        userDiscConn.otherName = null;
        if(conn != null) {
          // Notify the other user so he can disconnect his peer connection
          sendTo(userDiscConn, {type: "leave"}); 
        } 
      default:
        sendTo(connection, {type: "error", message: "Command no found: " + data.type});
        break;
    }

    connection.on("close", () => { 
      if(connection.name) { 
        delete users[connection.name];

        if(connection.otherName) {
          console.log(`Disconnecting: ${connection.name} & ${connection.otherName}`);
          let userDiscConn = users[connection.otherName];
          userDiscConn.otherName = null;
          if(userDiscConn != null) {
            sendTo(userDiscConn, {type: "leave"});
          }
        }
      }
    });
  });
}); 
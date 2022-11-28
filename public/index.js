let dropArea = document.getElementById('drop-area');
let statusBar = document.getElementById('status-bar');
let sendButton = document.getElementById('send-button');


//If the URL has a hash, we are downloading. If not, we are uploading.
if(window.location.hash) {
  dropArea.style.display = 'none';
} else {
  statusBar.style.display = 'none';
}

/* DRAG AND DROP */

let dragEnterHandler = (e) => {
  e.preventDefault();
  dropArea.classList.add('highlight');
}

let dragOverHandler = (e) => {
  e.preventDefault();
  dropArea.classList.add('highlight');
}

let dragLeaveHandler = (e) => {
  e.preventDefault();
  dropArea.classList.remove('highlight');
}

let dropHandler = (e) => {
  e.preventDefault();
  dropArea.classList.remove('highlight');

  let dt = e.dataTransfer;
  let files = dt.files;
  // Store the file that we want to upload inside window.file
  window.file = files[0];
  console.log(window.file);

  displayFiles();
  sendButton.disabled = false;
}

function displayFiles() {
  let fileList = document.getElementById('file-list');

  // Remove all children
  while(fileList.firstChild) {
    fileList.removeChild(fileList.firstChild);
  }

  // Display the files
  let file = document.createElement('p');
  file.classList.add('file');

  let fileImg = document.createElement('img');
  fileImg.src= '/assets/file.svg';
  file.appendChild(fileImg);

  let fileName = document.createElement('p');
  fileName.innerHTML = window.file.name;
  file.appendChild(fileName);

  fileList.appendChild(file);
}
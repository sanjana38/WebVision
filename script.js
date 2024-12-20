const video = document.getElementById('webcam');
const liveView = document.getElementById('liveView');
const demosSection = document.getElementById('demos');
const enableWebcamButton = document.getElementById('webcamButton');
const stopButton = document.getElementById('stopButton');
const switchCameraButton = document.getElementById('switchCamera');
let model; // Store the resulting model in the global scope
let stream; // To keep track of the video stream
let lastSpoken = ''; // Track the last spoken object
let facingMode = 'environment';
const children = [];
let lastSpokenTime = 0; // Track the last time the message was spoken
const REPEAT_INTERVAL = 7000;

// Set threshold to determine proximity (bounding box size)
const WARNING_THRESHOLD = 150; 

// Speech recognition setup
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.continuous = true;
recognition.interimResults = false;
recognition.lang = 'en-US';

// Check if webcam access is supported
function getUserMediaSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

// Load the COCO-SSD model
cocoSsd.load().then(loadedModel => {
    model = loadedModel;
    demosSection.classList.remove('invisible');
    speak('Model loaded successfully. You can now give voice commands like "enable webcam", "stop webcam", or "switch camera".');
});

// Add event listener for enabling the webcam
if (getUserMediaSupported()) {
    enableWebcamButton.addEventListener('click', enableCam);
    switchCameraButton.addEventListener('click', switchCamera);
    stopButton.addEventListener('click', stopCam);
    recognition.start(); // Start listening for voice commands
} else {
    console.warn('getUserMedia() is not supported by your browser');
}

// Enable the live webcam view and start classification
function enableCam() {
    if (!model) return;

    const constraints = { video: { facingMode: facingMode } }; // Use facingMode for initial camera selection

    navigator.mediaDevices.getUserMedia(constraints)
        .then(userMediaStream => {
            stream = userMediaStream; // Save the stream reference
            video.srcObject = stream;
            video.addEventListener('loadeddata', predictWebcam);
            enableWebcamButton.disabled = true;
            stopButton.disabled = false;
        })
        .catch(error => console.error('Error accessing the webcam:', error));
}

// Text-to-Speech function 
function speak(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    speechSynthesis.speak(utterance);
}

// Start predicting with the webcam feed
function predictWebcam() {
    model.detect(video).then(predictions => {
        // Clear previous predictions
        children.forEach(child => {
            if (liveView.contains(child)) {
                try {
                    liveView.removeChild(child);
                } catch (error) {
                    console.error(`Error removing child: ${child} -`, error);
                }
            }
        });
        children.length = 0;
        let currentObject = '';
        let proximityMessage = '';
        predictions.forEach(prediction => {
            if (prediction.score > 0.66) {
                const objectClass = `${prediction.class}`;
                const confidence = (prediction.score * 100).toFixed(2);
                const bboxSize = prediction.bbox[2] * prediction.bbox[3];
                const estimatedDistance = (1 / bboxSize * 10000).toFixed(2);
                const p = document.createElement('p');
                p.innerText = `${objectClass} (${confidence}% confidence), Distance: ${estimatedDistance} units`;
                p.style.marginLeft = `${prediction.bbox[0]}px`;
                p.style.marginTop = `${prediction.bbox[1] - 10}px`;
                p.style.width = `${prediction.bbox[2] - 10}px`;
                p.style.top = '0';
                p.style.left = '0';
                const highlighter = document.createElement('div');
                highlighter.setAttribute('class', 'highlighter');
                highlighter.style.left = `${prediction.bbox[0]}px`;
                highlighter.style.top = `${prediction.bbox[1]}px`;
                highlighter.style.width = `${prediction.bbox[2]}px`;
                highlighter.style.height = `${prediction.bbox[3]}px`;
                liveView.appendChild(highlighter);
                liveView.appendChild(p);
                children.push(highlighter, p);
                if (prediction.class === 'person' && bboxSize > WARNING_THRESHOLD) {
                    proximityMessage = 'Warning: person is near';
                } else if (bboxSize > WARNING_THRESHOLD) {
                    proximityMessage = `Warning: ${prediction.class} is near`;
                }
                if (!currentObject) {
                    currentObject = prediction.class;
                }
            }
        });

               // Speak the proximity message if the detected object is new or proximity changes
        const currentTime = Date.now();
        if (proximityMessage && (proximityMessage !== lastSpoken || currentTime - lastSpokenTime > REPEAT_INTERVAL)) {
            speak(proximityMessage);
            lastSpoken = proximityMessage; // Update the last spoken message
            lastSpokenTime = currentTime;  // Update the time when the message was spoken
        }
        window.requestAnimationFrame(predictWebcam);
    });
}

// Switching between front and back camera

async function switchCamera() { 
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    if (videoDevices.length <= 1) {
        speak("No additional camera available for switching.");
        return;
    }


    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }

    facingMode = facingMode === 'environment' ? 'user' : 'environment';

    const constraints = {
        video: { facingMode: facingMode }
    };

    try {
        const currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;
    } catch (err) {
        console.error('Error accessing camera: ', err);
    }
}

// Stop the webcam stream
function stopCam() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;

        speechSynthesis.cancel();

        children.forEach(child => {
            if (liveView.contains(child)) {
                liveView.removeChild(child);
            }
        });
        children.length = 0;

        enableWebcamButton.disabled = false;
        stopButton.disabled = true;

        lastSpoken = '';
    }
}

// Handle voice commands
recognition.onresult = function(event) {
    const last = event.results.length - 1;
    const command = event.results[last][0].transcript.trim().toLowerCase();
    console.log(`Voice command received: ${command}`);

   const enableCommands = ['enable webcam', 'on camera', 'on', 'turn on camera', 'enable camera', 'enable','start','start camera'];
  const stopCommands = ['stop webcam', 'off camera', 'off', 'turn off camera', 'stop', 'disable', 'disable camera', 'stop camera', 'turn off'];
  const switchCommands = ['switch webcam', 'switch camera', 'switch', 'change camera', 'change'];

if (enableCommands.some(phrase => command.includes(phrase))) {
    enableCam();
    speak("Webcam enabled.");
} else if (stopCommands.some(phrase => command.includes(phrase))) {
    stopCam();
    speak("Webcam stopped.");
     
    } else if (switchCommands.some(phrase => command.includes(phrase))) {
        switchCamera();
        speak("Switching camera.");
    }
};

recognition.onerror = function(event) {
    console.error('Speech recognition error:', event.error);
    speak('An error occurred during voice recognition. Please try again.');
};

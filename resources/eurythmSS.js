import WaveSurfer from 'https://cdn.jsdelivr.net/npm/wavesurfer.js@7/dist/wavesurfer.esm.js';
import { FieldEnabler } from "./FieldEnabler.js";
class GlobalManager {
	constructor() {
		// HTML element handles
		this.inputFile = document.getElementById("InputFile");
		this.timerField = document.getElementById("TimerField");
		this.totalDuration = document.getElementById("TotalDuration");
		this.zoomIn = document.getElementById("ZoomIn");
		this.zoomOut = document.getElementById("ZoomOut");
		this.playPause = document.getElementById("PlayPause");
		this.speedDigits = document.getElementById("SpeedDigits");
		this.speedVal = document.getElementById("SpeedVal");
		this.defaultSpeedButton = document.getElementById("DefaultSpeedButton");
		this.jumpSelector = document.getElementById("JumpSelector");
		this.leftArrowButton = document.getElementById("LeftArrowButton");
		this.rightArrowButton = document.getElementById("RightArrowButton");
		this.container = document.getElementById("recordings");
		this.recButton = document.getElementById("RecButton");
		this.playWav = document.getElementById("PlayWav");
		this.saveWav = document.getElementById("SaveWav");
		this.minSlider = document.getElementById('MinSlider');
		this.maxSlider = document.getElementById('MaxSlider');
		this.sliderTrack = document.querySelector('.SliderTrack');
		this.minValueSpan = document.getElementById('MinValue');
		this.maxValueSpan = document.getElementById('MaxValue');

		// player objects
		this.wavePlayer = null;
		this.audio = null;
		this.audioContext = null;
		this.isPlaying = false;

		// Recorder objects
		this.inRecording = false;
		this.recAudioCtx = null;
		this.capturedData = null;

		// zoom in/out management
		this.currentZoomFactor = 10;
		this.minimumZoomFactor = 10;
		this.zoomDelta = 10;
		this.storedZoomFactor = 10;

		// speed controller
		this.speedStorage = 1;
		this.defaultSpeedLabel = "1x Speed";

		// FFT section
		this.fftSize = 8192;
		this.minDecibels = -100;
		this.maxDecibels = -30;

		// Spectrogram section
		//   commpon variables
		const scopeHeight = 180;
		const scopeWidth = window.innerWidth;
		this.bin_width = 2;
		this.lowBoundary = 8;
		this.highBoundary = 20000; // NOT used, for now
		//   Model sound
		this.analyser = null;
		this.magFactor = 1.0;
		this.canvas = document.getElementById("Canvas");
		this.canvas.width = scopeWidth - 10;
		this.canvas.height = scopeHeight;
		this.cWidth = this.canvas.width;
		this.cHeight = this.canvas.height;
		this.canvasCtx = this.canvas.getContext("2d", { willReadFrequently: true });
		this.canvasCtx.lineWidth = 1;
		this.lowBlog = 0.0;
		//   Recorded sound
		this.recAnalyser = null;
		this.recMagFactor = 1.0;
		this.recCanvas = document.getElementById("RecCanvas");
		this.recCanvas.width = this.cWidth;
		this.recCanvas.height = this.cHeight;
		this.recCanvasCtx = this.recCanvas.getContext("2d", { willReadFrequently: true });
		this.recCanvasCtx.lineWidth = 1;
		this.recLowBlog = 0.0;
		this.srate = 44100;
		this.dataCaptureNode = null;
		this.capturedData = null;
		this.bufferSource = null;	// for playback

		this.fieldEnabler = new FieldEnabler([
			"InputFile",
			"PlayPause",
			"SpeedVal",
			"DefaultSpeedButton",
			"LeftArrowButton",
			"RightArrowButton",
			"RecButton",
		]);
		this.fieldEnabler.setEnable([
			"InputFile",
			"RecButton",
		]);
		this.playWav.disabled = true;
		this.saveWav.disabled = true;
	}
}
const G = new GlobalManager();

clearSpectrogramArea();
clearRecSpectrogramArea();

// file input
G.inputFile.addEventListener("change", (e) => {
	let file = G.inputFile.files[0];
	if (!file) return;
	if (G.wavePlayer != null) {
		G.wavePlayer.destroy();
	}
	G.audio = new Audio();
	const url = URL.createObjectURL(file);
	G.audio.src = url;

	G.wavePlayer = WaveSurfer.create({
		container: "#waveform",
		waveColor: "#00BFFF",
		progressColor: "#FF0000", // "#87CEBB",
		normalize: true,
		media: G.audio,
		height: 50,
	});

	G.audioContext = new AudioContext;
	G.audio.addEventListener("canplay", () => {
		const mediaNode = G.audioContext.createMediaElementSource(G.audio);
		G.analyser = G.audioContext.createAnalyser();
		G.analyser.fftSize = G.fftSize;
		G.analyser.minDecibels = G.minDecibels;
		G.analyser.maxDecibels = G.maxDecibels;
		G.analyser.smoothingTimeConstant = 0;

		G.lowBlog = 12 * Math.log2(G.lowBoundary);
		G.magFactor = (12 * Math.log2(G.analyser.frequencyBinCount) - G.lowBlog) / G.cHeight;

		mediaNode.connect(G.analyser);
		G.analyser.connect(G.audioContext.destination);
		clearSpectrogramArea();
	}, {
		once: true
	});

	// event processes for wavesurfer.js
	G.wavePlayer.on("ready", () => {
		readyCB();
	});
	G.wavePlayer.on("play", () => {
		playCB();
	});
	G.wavePlayer.on("pause", () => {
		pauseCB();
	});
	G.wavePlayer.on("finish", () => {
		stopUpdatingSpectrogram();
	});
	G.wavePlayer.on("timeupdate", (time) => {
		updateProgressFromSec(time);
	});

	G.fieldEnabler.setEnable([
		"InputFile",
		"RecButton",
	]);
});

G.inputFile.addEventListener("focus", () => {G.inputFile.blur()});	// this is to prevent activation by key-input.

function readyCB() {
	G.fieldEnabler.setEnable([
		"InputFile",
		"PlayPause",
		"SpeedVal",
		"DefaultSpeedButton",
		"LeftArrowButton",
		"RightArrowButton",
		"RecButton",
	]);
	G.zoomIn.disabled = false;
	G.zoomOut.disabled = true;

	G.currentZoomFactor = Math.trunc(window.innerWidth / G.wavePlayer.getDuration());
	if (G.currentZoomFactor < 1)  G.currentZoomFactor = 1;
	G.minimumZoomFactor = G.currentZoomFactor;
	G.zoomDelta = G.currentZoomFactor;
	G.storedZoomFactor = G.currentZoomFactor;
	G.wavePlayer.zoom(G.currentZoomFactor);

	G.speedVal.value = 1.0;
	G.defaultSpeedButton.value = G.defaultSpeedLabel;
	G.speedDigits.innerHTML = Number(G.speedVal.value).toFixed(2);
	G.speedStorage = 1;
	G.totalDuration.innerHTML = convertTimeRep(G.wavePlayer.getDuration());
}

function playCB() {
	G.fieldEnabler.setEnable([
		"PlayPause",
		"SpeedVal",
		"DefaultSpeedButton",
		"LeftArrowButton",
		"RightArrowButton",
		"RecButton",
	]);
	G.playPause.value = "Pause";
}

function pauseCB() {
	G.fieldEnabler.setEnable([
		"InputFile",
		"PlayPause",
		"SpeedVal",
		"DefaultSpeedButton",
		"LeftArrowButton",
		"RightArrowButton",
		"RecButton",
	]);
	G.playPause.value = "Play";
}

// Play/Pause control
G.playPause.addEventListener("click", playPauseControl);
function playPauseControl() {
	if (G.wavePlayer.isPlaying()) {
		G.wavePlayer.pause();
		stopUpdatingSpectrogram();
	} else {
		G.wavePlayer.play();
		if (G.audioContext.state === "suspended") {
			G.audioContext.resume();
		}
		G.audio.play();
		startUpdatingSpectrogram();
	}
}

// Reset play speed
G.defaultSpeedButton.addEventListener("click", resetPlaySpeed);
function resetPlaySpeed() {
	if (G.speedVal.value == 1.0) {
		G.speedVal.value = G.speedStorage;
		G.defaultSpeedButton.value = G.defaultSpeedLabel;
	} else {
		G.speedVal.value = 1.0;
		G.defaultSpeedButton.value = G.speedStorage + "x Speed";
	}
	G.speedVal.dispatchEvent(new Event("input"));
}

// Left Button (REW) click
G.leftArrowButton.addEventListener("click", leftButtonClick);
function leftButtonClick() {
	G.wavePlayer.setTime(G.wavePlayer.getCurrentTime() - Number(G.jumpSelector.value));
}

// Right Button (FF) click
G.rightArrowButton.addEventListener("click", rightButtonClick);
function rightButtonClick() {
	G.wavePlayer.setTime(G.wavePlayer.getCurrentTime() + Number(G.jumpSelector.value));
}

// Change play speed
G.speedVal.addEventListener("input", _changePlaySpeed);
function _changePlaySpeed() {
	const sp = Number(G.speedVal.value).toFixed(2);
	G.speedDigits.innerHTML = sp;
	if (sp != 1) {
		G.speedStorage = sp;
		G.defaultSpeedButton.value = G.defaultSpeedLabel;
	}
	G.wavePlayer.setPlaybackRate(G.speedVal.value, true);
}
G.speedVal.addEventListener("focus", () => { G.speedVal.blur(); });

function startUpdatingSpectrogram() {
	if (!G.isPlaying) {
		G.isPlaying = true;
		requestAnimationFrame(function mainLoop() {
			if (G.isPlaying) {
				feedSpectrogram();
				requestAnimationFrame(mainLoop);
			}
		});
	}
}

function stopUpdatingSpectrogram() {
	G.isPlaying = false;
}

function feedSpectrogram() {
	G.canvasCtx.drawImage(G.canvas, -G.bin_width, 0);
	const frequencyData = new Uint8Array(G.analyser.frequencyBinCount);
	G.analyser.getByteFrequencyData(frequencyData);
	for (let i = 0; i < G.cHeight; i++) {
		const fIdx = Math.trunc(Math.pow(2, ((i * G.magFactor) + G.lowBlog) / 12));
		if (fIdx < frequencyData.length) {
			const rgb = getJetColor(frequencyData[fIdx]/256.0);
			G.canvasCtx.fillStyle =  'rgb(' + rgb + ')';
		} else {
			G.canvasCtx.fillStyle = "rgb(0,0,0)";
		}
		G.canvasCtx.fillRect(
			G.canvas.width - G.bin_width,
			G.canvas.height - 1 - i,
			G.bin_width,
			1
		);
	}
}

// functions for keyboard operation
document.addEventListener("keydown", (evt) => {
	if (G.playPause.disabled)  return;
	if (evt.key == " ") {
		playPauseControl();
		evt.preventDefault();
	} else if (evt.key == "ArrowLeft") {
		leftButtonClick();
	} else if (evt.key == "ArrowRight") {
		rightButtonClick();
	} else if ((evt.key >= "1") && (evt.key <= 9)) {
		let delta = (evt.ctrlKey) ? Number(evt.key) : -Number(evt.key);
		G.wavePlayer.setTime(G.wavePlayer.getCurrentTime() + delta);
	} else if (evt.key == "ArrowUp") {
		G.speedVal.value = Number(G.speedVal.value) + 0.05;
		_changePlaySpeed();
	} else if (evt.key == "ArrowDown") {
		G.speedVal.value = Number(G.speedVal.value) - 0.05;
		_changePlaySpeed();
	} else if ((evt.key == "d") || (evt.key == "D")) {
		resetPlaySpeed();
	} else if ((evt.key == "i") || (evt.key == "I")) {
		processZoomIn(evt);
	} else if ((evt.key == "o") || (evt.key == "O")) {
		processZoomOut(evt);
	}
	evt.stopPropagation();
	evt.preventDefault();
	return false;
});

// Double-click disabler
document.addEventListener("dblclick", (e) => {
	e.preventDefault();
});

G.jumpSelector.addEventListener("change", (evt) => {
	evt.preventDefault();
});

G.zoomIn.addEventListener("click", (evt) => { processZoomIn(evt); });
function processZoomIn(evt) {
	G.zoomOut.disabled = false;
	if (evt.ctrlKey) {
		G.currentZoomFactor = G.storedZoomFactor;
	} else {
		G.currentZoomFactor += G.zoomDelta;
		G.storedZoomFactor = G.currentZoomFactor;
	}
	G.wavePlayer.zoom(G.currentZoomFactor);
}

G.zoomOut.addEventListener("click", (evt) => { processZoomOut(evt); });
function processZoomOut(evt) {
	if (G.currentZoomFactor > G.minimumZoomFactor) {
		if (evt.ctrlKey) {
			G.storedZoomFactor = G.currentZoomFactor;
			G.currentZoomFactor = G.minimumZoomFactor;
		} else {
			G.currentZoomFactor -= G.zoomDelta;
		}
		G.wavePlayer.zoom(G.currentZoomFactor);
		if (G.currentZoomFactor == G.minimumZoomFactor) {
			G.zoomOut.disabled = true;
		}
	}
}

function convertTimeRep(time) {
	let formattedTime = [
		Math.floor(time / 60), // minutes
		Math.floor(time % 60), // seconds
	].map((v) => (v < 10 ? '0' + v : v)).join(':');
	formattedTime += "." + ("" + Math.trunc(time * 100) % 100).padStart(2, "0");
	return formattedTime;
}

function updateProgressFromSec(time) {
	G.timerField.innerHTML = convertTimeRep(time);
}

window.addEventListener("resize", () => {
	G.canvas.width = G.recCanvas.width = G.cWidth = window.innerWidth - 10;
	clearSpectrogramArea();
	clearRecSpectrogramArea();
});

////////// recording section //////////

if (navigator.mediaDevices.getUserMedia) {
	let onSuccess = function(stream) { callback(stream); };
	let onError = function(err) { console.log("The following error occured: " + err); };
	navigator.mediaDevices.getUserMedia({audio: true}).then(onSuccess, onError);
} else {
	console.log('getUserMedia not supported on your browser!');
}

async function callback(stream) {
	if (!G.recAudioCtx) {
		G.recAudioCtx = new AudioContext({
			latencyHint: 'interactive',
			sampleRate: G.srate,
		});
	}

	const sourceNode = G.recAudioCtx.createMediaStreamSource(stream);

	G.recAnalyser = G.recAudioCtx.createAnalyser();
	G.recAnalyser.fftSize = G.fftSize;
	G.recAnalyser.minDecibels = G.minDecibels;
	G.recAnalyser.maxDecibels = G.maxDecibels;
	G.recAnalyser.smoothingTimeConstant = 0;

	G.recLowBlog = 12 * Math.log2(G.lowBoundary);
	G.recMagFactor = (12 * Math.log2(G.recAnalyser.frequencyBinCount) - G.recLowBlog) / G.cHeight;

	const bufferLength = G.recAnalyser.frequencyBinCount;

	sourceNode.connect(G.recAnalyser);

	try {
		await G.recAudioCtx.audioWorklet.addModule('./resources/audio-worklet-processor.js');
		G.dataCaptureNode = new AudioWorkletNode(G.recAudioCtx, "data-capture-processor");
		G.recAnalyser.connect(G.dataCaptureNode);

		G.dataCaptureNode.port.onmessage = (evt) => {
			if (evt.data.type === 'data') {
				G.capturedData = evt.data.payload;
			}
		};
	} catch(err) {
		console.error('Error:', err);
	}

}

function clearSpectrogramArea() {
	G.canvasCtx.fillStyle = "black";
	G.canvasCtx.fillRect(0, 0, G.cWidth, G.cHeight);
}

function clearRecSpectrogramArea() {
	G.recCanvasCtx.fillStyle = "black";
	G.recCanvasCtx.fillRect(0, 0, G.cWidth, G.cHeight);
}

G.recButton.addEventListener("mousedown", (evt) => {
	G.recButton.value = "Release to stop";
	clearRecSpectrogramArea();
	if (G.wavePlayer) {
		G.wavePlayer.pause();
		stopUpdatingSpectrogram();
	}
	G.inRecording = true;
	G.capturedData = [];
	G.dataCaptureNode.port.postMessage({ type: "start" });
	analyseWithFFT();
	G.playWav.disabled = false;
	G.saveWav.disabled = false;
});

function analyseWithFFT() {
	requestAnimationFrame(function mainLoop() {
		if (G.inRecording) {
			feedRecSpectrogram();
			requestAnimationFrame(mainLoop);
		}
	});
}

function feedRecSpectrogram() {
	G.recCanvasCtx.drawImage(G.recCanvas, -G.bin_width, 0);
	const frequencyData = new Uint8Array(G.recAnalyser.frequencyBinCount);
	G.recAnalyser.getByteFrequencyData(frequencyData);
	for (let i = 0; i < G.cHeight; i++) {
		const fIdx = Math.trunc(Math.pow(2, ((i * G.recMagFactor) + G.recLowBlog) / 12));
		if (fIdx < frequencyData.length) {
			const rgb = getJetColor(frequencyData[fIdx]/256.0);
			G.recCanvasCtx.fillStyle =  'rgb(' + rgb + ')';
		} else {
			G.recCanvasCtx.fillStyle = "rgb(0,0,0)";
		}
		G.recCanvasCtx.fillRect(
			G.recCanvas.width - G.bin_width,
			G.recCanvas.height - 1 - i,
			G.bin_width,
			1);
	}
	
}

G.recButton.addEventListener("mouseup", recordingStop);
G.recButton.addEventListener("mouseleave", () => {
	if (G.inRecording) {
		recordingStop();
	}
});
function recordingStop() {
	G.dataCaptureNode.port.postMessage({ type: "stop" });
	G.inRecording = false;
	G.recButton.value = "Press to record";
}

function downloadCapturedData(capturedData, sampleRate = 44100, numChannels = 1, filename = 'captured_audio.wav') {
	if (!capturedData || capturedData.length === 0) {
		return null;
	}
	const totalLength = capturedData.reduce((acc, cur) => acc + cur.length, 0);
	const interleavedData = new Float32Array(totalLength * numChannels);
	let offset = 0;
	for (const data of capturedData) {
		for (let i = 0; i < data.length; i++) {
			for (let channel = 0; channel < numChannels; channel++) {
				interleavedData[offset + i * numChannels + channel] = data[i];
			}
		}
		offset += data.length;
	}

	// Float32 (-1.0 to 1.0) を Int16 (-32768 to 32767) に変換
	const dataLength = interleavedData.length;
	const buffer = new ArrayBuffer(44 + dataLength * 2);
	const view = new DataView(buffer);

	/* RIFF chunk descriptor */
	writeString(view, 0, 'RIFF');
	view.setUint32(4, 36 + dataLength * 2, true);
	writeString(view, 8, 'WAVE');

	/* fmt sub-chunk */
	writeString(view, 12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);  // audio format (PCM = 1)
	view.setUint16(22, numChannels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * numChannels * 2, true); // byte rate
	view.setUint16(32, numChannels * 2, true);              // block align
	view.setUint16(34, 16, true);                             // bits per sample

	/* data sub-chunk */
	writeString(view, 36, 'data');
	view.setUint32(40, dataLength * 2, true);

	// オーディオデータの書き込み (Float32 -> Int16)
	let s = 44;
	for (let i = 0; i < dataLength; i++) {
		const sample = Math.max(-1, Math.min(1, interleavedData[i]));
		const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
		view.setInt16(s, int16, true);
		s += 2;
	}

	const wavBlob = new Blob([view], { type: 'audio/wav' });
	downloadBlob(wavBlob, filename); // ヘルパー関数を使ってダウンロード
}

function writeString(view, offset, string) {
	for (let i = 0; i < string.length; i++) {
		view.setUint8(offset + i, string.charCodeAt(i));
	}
}

function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

G.saveWav.addEventListener("click", () => {
	downloadCapturedData(G.capturedData, G.recAudioCtx.sampleRate);
});

G.playWav.addEventListener("click", async () => {
	if (G.recInPlay) {
		G.bufferSource.stop();
		return;
	}
	const audioCtx = new AudioContext();
//	audioCtx.resume();
	const combinedData = G.capturedData.reduce((acc, cur) => {
		const newArray = new Float32Array(acc.length + cur.length);
		newArray.set(acc);
		newArray.set(cur, acc.length);
		return newArray;
	}, new Float32Array(0));
	G.recInPlay = true;
	G.playWav.value = "Stop";
	G.saveWav.disabled = true;
	await playFloat32Array(
		audioCtx,
		combinedData,
		G.recAudioCtx.sampleRate
	);
});

async function playFloat32Array(audioContext, float32Array, sampleRate = 44100) {
	try {
		const audioBuffer = audioContext.createBuffer(
			1,
			float32Array.length,
			sampleRate
		);
		const channelData = audioBuffer.getChannelData(0);
		for (let i = 0; i < float32Array.length; i++) {
			channelData[i] = float32Array[i];
		}
		G.bufferSource = audioContext.createBufferSource();
		G.bufferSource.buffer = audioBuffer;
		G.bufferSource.connect(audioContext.destination);
		G.bufferSource.onended = () => {
			G.playWav.value = "Play";
			G.recInPlay = false;
			G.saveWav.disabled = false;
		};
		G.bufferSource.start();
	} catch (error) {
		console.error("Error playing Float32Array:", error);
		return null;
	}
}

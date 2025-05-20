class DataCaptureProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this.capturedData = [];
		this.isCapturing = false;

		this.port.onmessage = (event) => {
			if (event.data.type === 'start') {
				this.capturedData = [];
				this.isCapturing = true;
			} else if (event.data.type === 'stop') {
				this.isCapturing = false;
				this.port.postMessage({ type: 'data', payload: this.capturedData });
			}
		};
	}

	process(inputs, outputs, parameters) {
		if (this.isCapturing && inputs.length > 0 && inputs[0].length > 0) {
			// モノラルを想定
			this.capturedData.push(Array.from(inputs[0][0]));
		}
		// 入力をそのまま出力へルーティング (必要に応じて)
		if (outputs.length > 0 && inputs.length > 0) {
			for (let channel = 0; channel < outputs[0].length; ++channel) {
				if (inputs[0][channel]) {
					outputs[0][channel].set(inputs[0][channel]);
				}
			}
		}
		return true;
	}
}

registerProcessor('data-capture-processor', DataCaptureProcessor);

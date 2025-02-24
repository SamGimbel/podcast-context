// public/audio-processor.js
class AudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input[0]) {
      // Make a copy of the channel data so it doesn't get zeroed.
      const copiedData = new Float32Array(input[0]);
      // Compute average amplitude.
      let sum = 0;
      for (let i = 0; i < copiedData.length; i++) {
        sum += Math.abs(copiedData[i]);
      }
      const avg = sum / copiedData.length;
      this.port.postMessage({ chunk: copiedData, avg });
    } else {
      this.port.postMessage({ error: 'No input data received in AudioWorklet.' });
    }
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);

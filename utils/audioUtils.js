/**
 * Utility functions for audio processing
 */

/**
 * Merge an array of Float32Arrays into one
 * @param {Array<Float32Array>} buffers - Array of audio buffers
 * @returns {Float32Array} Merged buffer
 */
export function mergeBuffers(buffers) {
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const result = new Float32Array(totalLength);
  let offset = 0;
  buffers.forEach(buf => {
    result.set(buf, offset);
    offset += buf.length;
  });
  return result;
}

/**
 * Downsample a Float32Array from sourceRate to targetRate
 * @param {Float32Array} buffer - Audio buffer
 * @param {number} sourceRate - Source sample rate
 * @param {number} targetRate - Target sample rate
 * @returns {Float32Array} Downsampled buffer
 */
export function downsampleBuffer(buffer, sourceRate, targetRate) {
  if (targetRate >= sourceRate) {
    throw new Error("Target sample rate must be lower than source rate.");
  }
  const sampleRateRatio = sourceRate / targetRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0, count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

/**
 * Convert a Float32Array to an Int16Array (16-bit PCM)
 * @param {Float32Array} buffer - Float audio buffer
 * @returns {Int16Array} Int16 audio buffer
 */
export function float32ToInt16(buffer) {
  const l = buffer.length;
  const int16Buffer = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    int16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16Buffer;
}

/**
 * Compute RMS (Root Mean Square) of a Float32Array
 * @param {Float32Array} buffer - Audio buffer
 * @returns {number} RMS value
 */
export function computeRMS(buffer) {
  const sumSquares = buffer.reduce((sum, sample) => sum + sample * sample, 0);
  return Math.sqrt(sumSquares / buffer.length);
}

/**
 * Apply gain to a Float32Array without clipping
 * @param {Float32Array} buffer - Audio buffer
 * @param {number} gain - Gain factor
 * @returns {Float32Array} Amplified buffer
 */
export function applyGain(buffer, gain) {
  const result = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    result[i] = Math.max(-1, Math.min(1, buffer[i] * gain));
  }
  return result;
}

/**
 * Format time in seconds to MM:SS format
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string
 */
export function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

/**
 * Determines if a URL is a direct audio URL
 * @param {string} url - URL to check
 * @returns {boolean} True if direct audio URL
 */
export function isDirectAudioUrl(url) {
  // For now, use server-side processing for all URLs
  return false;
  
  // If we want to re-enable client-side processing later:
  // return url.endsWith('.mp3') || url.endsWith('.wav');
}

/**
 * Check if a URL is from Spotify
 * @param {string} url - URL to check
 * @returns {boolean} True if Spotify URL
 */
export function isSpotifyUrl(url) {
  return url.includes('spotify.com');
}
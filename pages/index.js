import { useState, useEffect, useRef } from 'react';
import { Box, Button, TextField, Typography, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

export default function Home() {
  const [audioUrl, setAudioUrl] = useState('');
  const [contextSegments, setContextSegments] = useState([]);
  const [logs, setLogs] = useState([]);
  const [playbackStarted, setPlaybackStarted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  // Prompt config state (only used in development)
  const [promptConfig, setPromptConfig] = useState({ contextPrompt: "", mainTopicInstruction: "" });

  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const bufferRef = useRef([]);
  const segmentStartRef = useRef(Date.now());
  const lastSegmentProcessedTime = useRef(0);

  // Load the current prompt configuration (only in development)
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      fetch('/api/get-prompt')
        .then(res => res.json())
        .then(data => {
          setPromptConfig(data);
          setLogs(prev => [...prev, "Loaded prompt configuration"]);
        })
        .catch(err => console.error("Failed to load prompt configuration:", err));
    }
  }, []);

  // Merge an array of Float32Arrays into one.
  function mergeBuffers(buffers) {
    const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;
    buffers.forEach(buf => {
      result.set(buf, offset);
      offset += buf.length;
    });
    return result;
  }

  // Downsample a Float32Array from sourceRate to targetRate.
  function downsampleBuffer(buffer, sourceRate, targetRate) {
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

  // Convert a Float32Array to an Int16Array (16-bit PCM).
  function float32ToInt16(buffer) {
    const l = buffer.length;
    const int16Buffer = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      int16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Buffer;
  }

  // Compute RMS of a Float32Array.
  function computeRMS(buffer) {
    const sumSquares = buffer.reduce((sum, sample) => sum + sample * sample, 0);
    return Math.sqrt(sumSquares / buffer.length);
  }

  // Apply gain to a Float32Array without clipping.
  function applyGain(buffer, gain) {
    const result = new Float32Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      result[i] = Math.max(-1, Math.min(1, buffer[i] * gain));
    }
    return result;
  }

  // Start the audio playback and capture process.
  const startListening = async () => {
    if (!audioUrl) {
      alert("Please enter a direct audio URL (MP3 or WAV).");
      return;
    }
    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.volume = 1;
      audioRef.current.crossOrigin = "anonymous";
      try {
        await audioRef.current.play();
        setPlaybackStarted(true);
        setLogs(prev => [...prev, "Playback started"]);
      } catch (err) {
        console.error("Audio playback error:", err);
      }
    }
    if (!audioRef.current) return;
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    await audioContext.resume();
    console.log("AudioContext sample rate:", audioContext.sampleRate);

    // Update pause/play status.
    audioRef.current.addEventListener('pause', () => {
      setIsPaused(true);
      setLogs(prev => [...prev, "Audio paused, transcription paused"]);
    });
    audioRef.current.addEventListener('play', () => {
      setIsPaused(false);
      setLogs(prev => [...prev, "Audio resumed, transcription resumed"]);
    });

    // Create a MediaElementSource.
    const sourceNode = audioContext.createMediaElementSource(audioRef.current);
    // Create a ChannelSplitterNode to route audio in parallel.
    const splitter = audioContext.createChannelSplitter(2);
    sourceNode.connect(splitter);
    // Connect one branch to destination so audio is heard.
    splitter.connect(audioContext.destination, 0);

    // Load the AudioWorklet module.
    try {
      await audioContext.audioWorklet.addModule('/audio-processor.js');
      setLogs(prev => [...prev, "AudioWorklet module loaded"]);
    } catch (err) {
      console.error("Failed to load AudioWorklet module:", err);
      setLogs(prev => [...prev, "Failed to load AudioWorklet module"]);
      return;
    }

    // Create an AudioWorkletNode.
    const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
    workletNode.port.onmessage = (event) => {
      if (isPaused) return; // Skip processing when paused.
      const data = event.data;
      if (data.error) {
        console.error("AudioWorklet error:", data.error);
        setLogs(prev => [...prev, `AudioWorklet error: ${data.error}`]);
        return;
      }
      if (data.avg !== undefined) {
        console.log("AudioWorklet chunk avg amplitude:", data.avg);
      }
      const chunk = data.chunk;
      bufferRef.current.push(new Float32Array(chunk));

      const elapsed = Date.now() - segmentStartRef.current;
      if (elapsed >= 30000 && (Date.now() - lastSegmentProcessedTime.current) > 1000) {
        lastSegmentProcessedTime.current = Date.now();
        const merged = mergeBuffers(bufferRef.current);
        console.log("Merged buffer length (samples):", merged.length);
        const rmsBefore = computeRMS(Array.from(merged));
        console.log("Merged buffer RMS before gain:", rmsBefore);
        const gainFactor = 10; // Adjust as needed.
        const amplified = applyGain(merged, gainFactor);
        const rmsAfter = computeRMS(Array.from(amplified));
        console.log("Merged buffer RMS after gain:", rmsAfter);
        const downsampled = downsampleBuffer(amplified, audioContext.sampleRate, 16000);
        console.log("Downsampled length (samples):", downsampled.length);
        const int16Data = float32ToInt16(downsampled);
        console.log("Sending PCM data of length (samples):", int16Data.length);
        fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: int16Data.buffer,
        })
          .then(async (res) => {
            const text = await res.text();
            try {
              return JSON.parse(text);
            } catch (e) {
              console.error("Failed to parse JSON. Raw response:", text);
              throw e;
            }
          })
          .then((data) => {
            console.log('Received context segment:', data);
            setContextSegments(prev => [...prev, data]);
          })
          .catch(err => console.error('Error sending audio chunk:', err));
        setLogs(prev => [...prev, 'Processed 30-second segment']);
        bufferRef.current = [];
        segmentStartRef.current = Date.now();
      }
    };

    // Connect one branch of the splitter (channel 0) to the AudioWorkletNode.
    splitter.connect(workletNode, 0);
  };

  // Function to update prompt configuration via API.
  const savePromptConfig = async () => {
    try {
      const res = await fetch('/api/update-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promptConfig),
      });
      const data = await res.json();
      setLogs(prev => [...prev, "Prompt configuration updated"]);
    } catch (err) {
      console.error("Error updating prompt config:", err);
      setLogs(prev => [...prev, "Error updating prompt config"]);
    }
  };

  // Only show prompt editor in development.
  const promptEditor = process.env.NODE_ENV === 'development' && (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography>Edit Prompt Configuration</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <TextField
          label="Context Prompt"
          fullWidth
          multiline
          minRows={4}
          value={promptConfig.contextPrompt}
          onChange={(e) => setPromptConfig(prev => ({ ...prev, contextPrompt: e.target.value }))}
          sx={{ mb: 2 }}
        />
        <TextField
          label="Main Topic Instruction"
          fullWidth
          multiline
          minRows={2}
          value={promptConfig.mainTopicInstruction}
          onChange={(e) => setPromptConfig(prev => ({ ...prev, mainTopicInstruction: e.target.value }))}
          sx={{ mb: 2 }}
        />
        <Button variant="contained" onClick={savePromptConfig}>Save Prompt Config</Button>
      </AccordionDetails>
    </Accordion>
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      {/* Left Panel: Audio URL Input & Player */}
      <Box sx={{ flex: 1, p: 2 }}>
        <Typography variant="h4" gutterBottom>Podcast Context MVP</Typography>
        <TextField
          fullWidth
          label="Direct Audio URL (MP3 or WAV)"
          variant="outlined"
          value={audioUrl}
          onChange={(e) => setAudioUrl(e.target.value)}
          sx={{ mb: 2 }}
        />
        <Button variant="contained" onClick={startListening} sx={{ mb: 2 }}>Start Listening</Button>
        {playbackStarted && <Typography variant="body1">Playback started</Typography>}
        <audio
          id="audio-player"
          ref={audioRef}
          controls
          autoPlay
          crossOrigin="anonymous"
          style={{ width: '100%', marginTop: '16px' }}
        />
      </Box>
      {/* Right Panel: Context Timeline, Debug Logs, and Prompt Editor (dev only) */}
      <Box sx={{ flex: 1, p: 2, borderLeft: '1px solid #ccc', overflowY: 'auto' }}>
        <Typography variant="h5" gutterBottom>Context Timeline</Typography>
        {contextSegments.map((segment, idx) => (
          <Box key={idx} sx={{ mb: 2, borderBottom: '1px solid #eee', pb: 1 }}>
            <Typography variant="subtitle1"><strong>Segment:</strong> {segment.segment || '30-second segment'}</Typography>
            <Typography variant="body2"><strong>Transcript:</strong> {segment.transcript}</Typography>
            <Typography variant="body2"><strong>Context:</strong> {segment.context}</Typography>
            {segment.wikipedia && (
              <Typography variant="body2">
                <strong>Wikipedia:</strong> <a href={segment.wikipedia.url} target="_blank" rel="noopener noreferrer">{segment.wikipedia.title}</a>
              </Typography>
            )}
          </Box>
        ))}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography>Click here for debug data</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {logs.map((log, idx) => (
              <Typography key={idx} variant="caption" display="block">{log}</Typography>
            ))}
          </AccordionDetails>
        </Accordion>
        {promptEditor}
      </Box>
    </Box>
  );
}

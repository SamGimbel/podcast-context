import { useState, useEffect, useRef } from 'react';
import { 
  Box, 
  Button, 
  TextField, 
  Typography, 
  Accordion, 
  AccordionSummary, 
  AccordionDetails,
  CircularProgress,
  Tabs,
  Tab,
  Paper,
  Chip,
  Divider,
  LinearProgress,
  IconButton,
  Alert,
  Snackbar,
  Grid
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import InfoIcon from '@mui/icons-material/Info';
import WikipediaIcon from '@mui/icons-material/Language';
import TimestampIcon from '@mui/icons-material/Schedule';

export default function Home() {
  const [audioUrl, setAudioUrl] = useState('');
  const [contextSegments, setContextSegments] = useState([]);
  const [logs, setLogs] = useState([]);
  const [playbackStarted, setPlaybackStarted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTab, setCurrentTab] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(-1);
  const [summary, setSummary] = useState('');
  const [topTopics, setTopTopics] = useState([]);
  
  // Prompt config state (only used in development)
  const [promptConfig, setPromptConfig] = useState({ contextPrompt: "", mainTopicInstruction: "" });

  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const bufferRef = useRef([]);
  const segmentStartRef = useRef(Date.now());
  const lastSegmentProcessedTime = useRef(0);
  const eventSourceRef = useRef(null);

  // Debug log function
  const addLog = (message) => {
    console.log(message); // Also log to console for debugging
    setLogs(prev => [...prev, `${new Date().toISOString().substr(11, 8)} - ${message}`]);
  };

  // Load the current prompt configuration (only in development)
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      fetch('/api/get-prompt')
        .then(res => res.json())
        .then(data => {
          setPromptConfig(data);
          addLog("Loaded prompt configuration");
        })
        .catch(err => {
          console.error("Failed to load prompt configuration:", err);
          addLog("Failed to load prompt configuration");
        });
    }
  }, []);

  // Effect to update current segment based on audio playback time
  useEffect(() => {
    if (!audioRef.current || contextSegments.length === 0) return;
    
    const updateCurrentSegment = () => {
      const currentTime = audioRef.current.currentTime;
      // Estimate which segment is currently playing
      // This is an approximation since we don't have exact timestamps
      const segmentDuration = 15; // 15 seconds per segment
      const estimatedIndex = Math.floor(currentTime / segmentDuration);
      
      if (estimatedIndex !== currentSegmentIndex && estimatedIndex < contextSegments.length) {
        setCurrentSegmentIndex(estimatedIndex);
      }
    };
    
    const interval = setInterval(updateCurrentSegment, 1000);
    return () => clearInterval(interval);
  }, [contextSegments, currentSegmentIndex]);

  // Effect to generate summary when we have enough segments
  useEffect(() => {
    if (contextSegments.length >= 4 && contextSegments.length % 4 === 0) {
      generateSummary();
      updateTopTopics();
    }
  }, [contextSegments]);

  // Function to generate a summary from multiple segments
  const generateSummary = async () => {
    try {
      // Get the last 4 segments
      const recentSegments = contextSegments.slice(-4);
      const combinedTranscript = recentSegments.map(s => s.transcript).join(' ');
      
      // Make API call to generate summary
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: combinedTranscript, summarize: true })
      });
      
      if (response.ok) {
        const data = await response.json();
        setSummary(data.context || 'No summary available.');
      }
    } catch (error) {
      console.error('Error generating summary:', error);
    }
  };

  // Function to update top topics
  const updateTopTopics = () => {
    // Count topic occurrences
    const topicCounts = {};
    contextSegments.forEach(segment => {
      if (segment.mainTopic) {
        topicCounts[segment.mainTopic] = (topicCounts[segment.mainTopic] || 0) + 1;
      }
    });
    
    // Convert to array and sort
    const sortedTopics = Object.entries(topicCounts)
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5 topics
    
    setTopTopics(sortedTopics);
  };

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

  // Set up SSE connection for stream mode
  const setupSSEConnection = () => {
    try {
      addLog(`Setting up SSE connection for URL: ${audioUrl}`);
      
      if (eventSourceRef.current) {
        addLog("Closing existing SSE connection");
        eventSourceRef.current.close();
      }
      
      const encodedUrl = encodeURIComponent(audioUrl);
      addLog(`Encoded URL: ${encodedUrl}`);
      
      const url = `/api/stream?podcastUrl=${encodedUrl}`;
      addLog(`SSE URL: ${url}`);
      
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;
      
      eventSource.onopen = () => {
        addLog("SSE connection opened");
      };
      
      eventSource.addEventListener('message', (event) => {
        try {
          addLog(`SSE message received: ${event.data.substring(0, 50)}...`);
          const data = JSON.parse(event.data);
          if (data.transcript) {
            setContextSegments(prev => [...prev, data]);
            addLog(`Received segment: ${data.segment}`);
          }
        } catch (err) {
          console.error('Error parsing SSE data:', err);
          addLog(`Error parsing SSE data: ${err.message}`);
        }
      });
      
      eventSource.addEventListener('status', (event) => {
        try {
          const data = JSON.parse(event.data);
          addLog(`Status update: ${data.status} - ${data.message}`);
          setProcessingStatus(data.status);
          setStatusMessage(data.message);
          
          if (data.status === 'error') {
            setErrorMessage(data.error || 'An unknown error occurred');
            setShowError(true);
          }
        } catch (err) {
          console.error('Error parsing status event:', err);
          addLog(`Error parsing status event: ${err.message}`);
        }
      });
      
      eventSource.addEventListener('log', (event) => {
        try {
          const data = JSON.parse(event.data);
          addLog(data.message || event.data);
        } catch (err) {
          addLog(event.data);
        }
      });
      
      eventSource.onerror = (err) => {
        console.error('EventSource error:', err);
        addLog(`SSE connection error: ${JSON.stringify(err)}`);
        
        if (eventSource.readyState === EventSource.CLOSED) {
          setProcessingStatus('error');
          setStatusMessage('Connection closed');
          addLog("SSE connection closed");
        }
      };
      
      return eventSource;
    } catch (error) {
      console.error("Error setting up SSE connection:", error);
      addLog(`Error setting up SSE connection: ${error.message}`);
      setErrorMessage(`Error setting up connection: ${error.message}`);
      setShowError(true);
      return null;
    }
  };

  // Start the audio playback and processing
  const startListening = () => {
    try {
      addLog("startListening function called");
      
      if (!audioUrl) {
        setErrorMessage("Please enter a direct audio URL or a Spotify podcast URL");
        setShowError(true);
        addLog("No audio URL provided");
        return;
      }
      
      // Reset state
      setContextSegments([]);
      addLog("State reset");
      setIsPaused(false);
      setCurrentSegmentIndex(-1);
      setSummary('');
      setTopTopics([]);
      setProcessingStatus('initializing');
      setStatusMessage('Starting audio processing...');
      
      // Decide between stream mode or client-side processing
      const isDirectUrl = audioUrl.endsWith('.mp3') || audioUrl.endsWith('.wav');
      const isSpotifyUrl = audioUrl.includes('spotify.com');
      
      addLog(`URL type: ${isDirectUrl ? 'direct' : isSpotifyUrl ? 'spotify' : 'other'}`);
      
      if (isDirectUrl) {
        // Use direct playback with client-side processing
        addLog("Using direct playback with client-side processing");
        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          audioRef.current.volume = 1;
          audioRef.current.crossOrigin = "anonymous";
          
          audioRef.current.play()
            .then(() => {
              addLog("Audio playback started");
              setPlaybackStarted(true);
              setupClientSideProcessing();
            })
            .catch((err) => {
              console.error("Audio playback error:", err);
              addLog(`Audio playback error: ${err.message}`);
              setErrorMessage("Failed to play audio: " + err.message);
              setShowError(true);
            });
        }
      } else {
        // Use server-side streaming for Spotify URLs or other URLs
        addLog("Using server-side streaming");
        setupSSEConnection();
        
        // For Spotify, we'll receive the playable URL from the server
        if (isSpotifyUrl) {
          setStatusMessage('Processing Spotify podcast URL...');
          addLog("Processing Spotify URL");
        }
        
        // Set playback started - audio will start when we get the URL
        setPlaybackStarted(true);
      }
    } catch (error) {
      console.error("Error in startListening:", error);
      addLog(`Error in startListening: ${error.message}`);
      setErrorMessage(`Error starting playback: ${error.message}`);
      setShowError(true);
    }
  };

  // Set up client-side processing with AudioWorklet
  const setupClientSideProcessing = async () => {
    try {
      addLog("Setting up client-side processing");
      
      if (!audioRef.current) {
        addLog("No audio element reference");
        return;
      }
      
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      await audioContext.resume();
      addLog(`AudioContext created with sample rate: ${audioContext.sampleRate}`);

      // Update pause/play status
      audioRef.current.addEventListener('pause', () => {
        setIsPaused(true);
        addLog("Audio paused, transcription paused");
      });
      
      audioRef.current.addEventListener('play', () => {
        setIsPaused(false);
        addLog("Audio resumed, transcription resumed");
      });

      // Create a MediaElementSource
      const sourceNode = audioContext.createMediaElementSource(audioRef.current);
      addLog("MediaElementSource created");
      
      // Create a ChannelSplitterNode to route audio in parallel
      const splitter = audioContext.createChannelSplitter(2);
      sourceNode.connect(splitter);
      addLog("ChannelSplitter connected");
      
      // Connect one branch to destination so audio is heard
      splitter.connect(audioContext.destination, 0);
      addLog("Audio routed to destination");

      // Load the AudioWorklet module
      try {
        await audioContext.audioWorklet.addModule('/audio-processor.js');
        addLog("AudioWorklet module loaded");
      } catch (err) {
        console.error("Failed to load AudioWorklet module:", err);
        addLog(`Failed to load AudioWorklet module: ${err.message}`);
        return;
      }

      // Create an AudioWorkletNode
      const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
      addLog("AudioWorkletNode created");
      
      workletNode.port.onmessage = (event) => {
        if (isPaused) return; // Skip processing when paused
        
        const data = event.data;
        if (data.error) {
          console.error("AudioWorklet error:", data.error);
          addLog(`AudioWorklet error: ${data.error}`);
          return;
        }
        
        if (data.avg !== undefined) {
          console.log("AudioWorklet chunk avg amplitude:", data.avg);
        }
        
        const chunk = data.chunk;
        bufferRef.current.push(new Float32Array(chunk));

        const elapsed = Date.now() - segmentStartRef.current;
        // Process every 15 seconds instead of 30 for more responsiveness
        if (elapsed >= 15000 && (Date.now() - lastSegmentProcessedTime.current) > 1000) {
          lastSegmentProcessedTime.current = Date.now();
          addLog("Processing 15-second audio segment");
          
          // Send status update
          setProcessingStatus('processing');
          setStatusMessage('Processing audio segment...');
          
          const merged = mergeBuffers(bufferRef.current);
          addLog(`Merged buffer length (samples): ${merged.length}`);
          
          const rmsBefore = computeRMS(merged);
          addLog(`Merged buffer RMS before gain: ${rmsBefore}`);
          
          const gainFactor = 10; // Adjust as needed
          const amplified = applyGain(merged, gainFactor);
          
          const rmsAfter = computeRMS(amplified);
          addLog(`Merged buffer RMS after gain: ${rmsAfter}`);
          
          const downsampled = downsampleBuffer(amplified, audioContext.sampleRate, 16000);
          addLog(`Downsampled length (samples): ${downsampled.length}`);
          
          const int16Data = float32ToInt16(downsampled);
          addLog(`Sending PCM data of length (samples): ${int16Data.length}`);
          
          fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: int16Data.buffer,
          })
            .then(async (res) => {
              addLog(`Received response from transcribe API: ${res.status}`);
              const text = await res.text();
              try {
                return JSON.parse(text);
              } catch (e) {
                console.error("Failed to parse JSON. Raw response:", text);
                addLog(`Failed to parse JSON: ${text.substring(0, 100)}`);
                throw e;
              }
            })
            .then((data) => {
              addLog(`Received context segment for: ${data.transcript.substring(0, 50)}...`);
              setContextSegments(prev => [...prev, data]);
              setProcessingStatus('ready');
              setStatusMessage('Segment processed successfully');
            })
            .catch(err => {
              console.error('Error sending audio chunk:', err);
              addLog(`Error sending audio chunk: ${err.message}`);
              setProcessingStatus('error');
              setStatusMessage('Error processing segment');
            });
            
          bufferRef.current = [];
          segmentStartRef.current = Date.now();
        }
      };

      // Connect one branch of the splitter (channel 0) to the AudioWorkletNode
      splitter.connect(workletNode, 0);
      addLog("AudioWorkletNode connected to audio source");
    } catch (error) {
      console.error("Error in setupClientSideProcessing:", error);
      addLog(`Error in setupClientSideProcessing: ${error.message}`);
    }
  };

  // Compute RMS of a Float32Array
  function computeRMS(buffer) {
    const sumSquares = buffer.reduce((sum, sample) => sum + sample * sample, 0);
    return Math.sqrt(sumSquares / buffer.length);
  }

  // Apply gain to a Float32Array without clipping
  function applyGain(buffer, gain) {
    const result = new Float32Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      result[i] = Math.max(-1, Math.min(1, buffer[i] * gain));
    }
    return result;
  }

  // Function to update prompt configuration via API
  const savePromptConfig = async () => {
    try {
      const res = await fetch('/api/update-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promptConfig),
      });
      const data = await res.json();
      addLog("Prompt configuration updated");
    } catch (err) {
      console.error("Error updating prompt config:", err);
      addLog(`Error updating prompt config: ${err.message}`);
    }
  };

  // Jump to a specific segment in the audio
  const jumpToSegment = (index) => {
    if (!audioRef.current || index < 0 || index >= contextSegments.length) return;
    
    // Estimate the time based on segment index (15 seconds per segment)
    const estimatedTime = index * 15;
    audioRef.current.currentTime = estimatedTime;
    setCurrentSegmentIndex(index);
    addLog(`Jumped to segment ${index} (time: ${estimatedTime}s)`);
  };

  // Handle tab change
  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
  };

  // Only show prompt editor in development
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

  // Debug button for testing event binding
  const testButtonClick = () => {
    addLog("Test button clicked!");
    alert("Button click test successful");
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#f5f5f7' }}>
      {/* Header */}
      <Box sx={{ p: 2, bgcolor: '#fff', boxShadow: 1 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', color: '#333' }}>
          Podcast Context Assistant
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Listen to podcasts with real-time AI-generated context
        </Typography>
      </Box>
      
      {/* Main content */}
      <Box sx={{ display: 'flex', flexGrow: 1, p: 2, overflow: 'hidden' }}>
        {/* Left Panel: Audio URL Input & Player */}
        <Box sx={{ flex: '0 0 350px', p: 2, mr: 2, bgcolor: '#fff', borderRadius: 2, boxShadow: 1 }}>
          <Typography variant="h6" gutterBottom>Podcast Audio</Typography>
          
          <TextField
            fullWidth
            label="Podcast URL (MP3, WAV, or Spotify)"
            variant="outlined"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            sx={{ mb: 2 }}
          />
          
          <Button 
            variant="contained" 
            onClick={() => {
              console.log("Start Listening button clicked");
              addLog("Start Listening button clicked");
              startListening();
            }}
            sx={{ mb: 2, width: '100%' }}
            disabled={processingStatus === 'initializing' || processingStatus === 'processing'}
          >
            {processingStatus === 'initializing' || processingStatus === 'processing' ? (
              <>
                <CircularProgress size={24} sx={{ mr: 1, color: 'white' }} />
                Processing...
              </>
            ) : 'Start Listening'}
          </Button>
          
          {/* Test button for debugging */}
          {process.env.NODE_ENV === 'development' && (
            <Button 
              variant="outlined" 
              onClick={testButtonClick}
              sx={{ mb: 2, width: '100%' }}
            >
              Test Button Click
            </Button>
          )}
          
          {/* Status indicator */}
          {processingStatus !== 'idle' && (
            <Box sx={{ mb: 2 }}>
              <LinearProgress 
                variant={processingStatus === 'processing' ? 'indeterminate' : 'determinate'} 
                value={processingStatus === 'ready' ? 100 : 0}
                color={processingStatus === 'error' ? 'error' : 'primary'}
              />
              <Typography variant="caption" color="text.secondary">
                {statusMessage}
              </Typography>
            </Box>
          )}
          
          {playbackStarted && (
            <>
              <Paper elevation={0} sx={{ p: 2, mb: 2, bgcolor: '#f9f9f9', borderRadius: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
                  <IconButton onClick={() => audioRef.current.currentTime -= 15}>
                    <SkipPreviousIcon />
                  </IconButton>
                  
                  <IconButton 
                    onClick={() => isPaused ? audioRef.current.play() : audioRef.current.pause()}
                    sx={{ mx: 1 }}
                  >
                    {isPaused ? <PlayArrowIcon fontSize="large" /> : <PauseIcon fontSize="large" />}
                  </IconButton>
                  
                  <IconButton onClick={() => audioRef.current.currentTime += 15}>
                    <SkipNextIcon />
                  </IconButton>
                </Box>
                
                <audio
                  ref={audioRef}
                  controls
                  style={{ width: '100%' }}
                  crossOrigin="anonymous"
                />
              </Paper>
              
              {/* Topic Overview */}
              {topTopics.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle1" gutterBottom>Key Topics</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {topTopics.map((topic, idx) => (
                      <Chip 
                        key={idx} 
                        label={topic.topic} 
                        size="small"
                        color={idx === 0 ? "primary" : "default"}
                      />
                    ))}
                  </Box>
                </Box>
              )}
              
              {summary && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle1" gutterBottom>Recent Summary</Typography>
                  <Typography variant="body2">{summary}</Typography>
                </Box>
              )}
            </>
          )}
          
          {promptEditor}
        </Box>
        
        {/* Right Panel: Context Timeline, Transcript, and Wiki Info */}
        <Box sx={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          overflow: 'hidden', 
          bgcolor: '#fff', 
          borderRadius: 2,
          boxShadow: 1
        }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={currentTab} onChange={handleTabChange}>
              <Tab label="Timeline" />
              <Tab label="Transcript" />
              <Tab label="Debug" />
            </Tabs>
          </Box>
          
          {/* Timeline Tab */}
          <Box 
            role="tabpanel"
            hidden={currentTab !== 0}
            sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}
          >
            {contextSegments.length === 0 ? (
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center',
                height: '100%',
                color: 'text.secondary'
              }}>
                <InfoIcon sx={{ fontSize: 60, opacity: 0.3, mb: 2 }} />
                <Typography>Start playing a podcast to see AI-generated context</Typography>
              </Box>
            ) : (
              contextSegments.map((segment, idx) => (
                <Paper
                  key={idx}
                  sx={{ 
                    mb: 2, 
                    p: 2, 
                    borderLeft: '4px solid',
                    borderColor: currentSegmentIndex === idx ? 'primary.main' : 'grey.300',
                    bgcolor: currentSegmentIndex === idx ? 'rgba(0, 0, 255, 0.03)' : 'white',
                    cursor: 'pointer'
                  }}
                  onClick={() => jumpToSegment(idx)}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {segment.mainTopic || `Segment ${idx + 1}`}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <TimestampIcon fontSize="small" sx={{ mr: 0.5, color: 'text.secondary' }} />
                      <Typography variant="caption" color="text.secondary">
                        {Math.floor(idx * 15 / 60)}:{String(idx * 15 % 60).padStart(2, '0')}
                      </Typography>
                    </Box>
                  </Box>
                  
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {segment.transcript}
                  </Typography>
                  
                  <Divider sx={{ my: 1 }} />
                  
                  <Typography variant="body2">
                    {segment.context?.replace(/MAIN_TOPIC:.*$/, '')}
                  </Typography>
                  
                  {segment.wikipedia && (
                    <Box sx={{ mt: 1, display: 'flex', alignItems: 'center' }}>
                      <WikipediaIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
                      <Typography variant="body2">
                        <a 
                          href={segment.wikipedia.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ color: '#1976d2', textDecoration: 'none' }}
                        >
                          {segment.wikipedia.title}
                        </a>
                        {segment.wikipedia.snippet && (
                          <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                            {segment.wikipedia.snippet}
                          </Typography>
                        )}
                      </Typography>
                    </Box>
                  )}
                </Paper>
              ))
            )}
          </Box>
          
          {/* Transcript Tab */}
          <Box 
            role="tabpanel"
            hidden={currentTab !== 1}
            sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}
          >
            {contextSegments.length === 0 ? (
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center',
                height: '100%',
                color: 'text.secondary'
              }}>
                <InfoIcon sx={{ fontSize: 60, opacity: 0.3, mb: 2 }} />
                <Typography>Start playing a podcast to see transcript</Typography>
              </Box>
            ) : (
              <Box>
                {contextSegments.map((segment, idx) => (
                  <Box 
                    key={idx}
                    onClick={() => jumpToSegment(idx)}
                    sx={{ 
                      cursor: 'pointer',
                      p: 1, 
                      borderLeft: '3px solid',
                      pl: 2,
                      mb: 2,
                      borderColor: currentSegmentIndex === idx ? 'primary.main' : 'transparent',
                      bgcolor: currentSegmentIndex === idx ? 'rgba(0, 0, 255, 0.03)' : 'transparent',
                    }}
                  >
                    <Typography color="text.secondary" variant="caption" sx={{ mr: 1 }}>
                      [{Math.floor(idx * 15 / 60)}:{String(idx * 15 % 60).padStart(2, '0')}]
                    </Typography>
                    <Typography component="span">
                      {segment.transcript}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
          
          {/* Debug Tab */}
          <Box 
            role="tabpanel"
            hidden={currentTab !== 2}
            sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}
          >
            <Typography variant="h6" gutterBottom>Debug Information</Typography>
            {logs.map((log, idx) => (
              <Typography key={idx} variant="caption" display="block" sx={{ mb: 0.5 }}>
                {log}
              </Typography>
            ))}
          </Box>
        </Box>
      </Box>
      
      {/* Error Snackbar */}
      <Snackbar
        open={showError}
        autoHideDuration={6000}
        onClose={() => setShowError(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setShowError(false)} 
          severity="error" 
          sx={{ width: '100%' }}
        >
          {errorMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}
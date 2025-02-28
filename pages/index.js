import { useState, useEffect, useRef } from 'react';
import { 
  Box, 
  Button, 
  TextField, 
  Typography, 
  Tabs,
  Tab,
  Paper,
  Snackbar,
  Alert,
  Checkbox,
  IconButton
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';

// Components
import ContextTimeline from '../components/ContextTimeline';
import DebugPanel from '../components/DebugPanel';
import PromptEditor from '../components/PromptEditor';
import StatusIndicator, { LoadingIndicator } from '../components/StatusIndicator';
import TopicsList from '../components/TopicsList';
import TranscriptView from '../components/TranscriptView';

// Utils
import { createLogger } from '../utils/logUtils';

export default function Home() {
  // State
  const [audioUrl, setAudioUrl] = useState('');
  const [contextSegments, setContextSegments] = useState([]);
  const [logs, setLogs] = useState([]);
  const [currentTab, setCurrentTab] = useState(0);
  const [promptConfig, setPromptConfig] = useState({ 
    contextPrompt: "", 
    mainTopicInstruction: "" 
  });
  const [playbackStarted, setPlaybackStarted] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [summary, setSummary] = useState('');
  const [topTopics, setTopTopics] = useState([]);
  const [debugModeEnabled, setDebugModeEnabled] = useState(true);
  const [isPaused, setIsPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [pendingSegments, setPendingSegments] = useState([]);
  
  // Refs
  const audioRef = useRef(null);
  const currentSegmentRef = useRef(-1);
  const eventSourceRef = useRef(null);
  const timerRef = useRef(null);
  
  // Create logger
  const logger = (message) => {
    console.log(message);
    setLogs(prev => [...prev, `${new Date().toISOString().substring(11, 19)} - ${message}`]);
  };
  
  // Calculate current segment based on audio time
  useEffect(() => {
    if (!playbackStarted) return;
    
    const segmentDuration = 15; // 15 seconds per segment
    const newSegmentIndex = Math.floor(currentTime / segmentDuration);
    
    if (newSegmentIndex !== currentSegmentRef.current) {
      currentSegmentRef.current = newSegmentIndex;
      logger(`Current segment changed to ${newSegmentIndex} (${currentTime}s)`);
      
      // Process any pending segments that are now due
      processPendingSegments(newSegmentIndex);
    }
  }, [currentTime, playbackStarted]);
  
  // Update timer for current time
  useEffect(() => {
    if (!playbackStarted || !audioRef.current) return;
    
    const updateTimer = () => {
      if (audioRef.current && !isPaused) {
        setCurrentTime(audioRef.current.currentTime);
      }
    };
    
    // Update every 250ms
    timerRef.current = setInterval(updateTimer, 250);
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [playbackStarted, isPaused]);
  
  // Set up audio events when audio element changes
  useEffect(() => {
    if (!audioRef.current) return;
    
    const handlePlay = () => {
      setIsPaused(false);
      logger("Audio playback started");
    };
    
    const handlePause = () => {
      setIsPaused(true);
      logger("Audio playback paused");
    };
    
    const handleTimeUpdate = () => {
      // This is handled by the interval timer for smoother updates
    };
    
    // Add event listeners
    audioRef.current.addEventListener('play', handlePlay);
    audioRef.current.addEventListener('pause', handlePause);
    audioRef.current.addEventListener('timeupdate', handleTimeUpdate);
    
    // Clean up
    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener('play', handlePlay);
        audioRef.current.removeEventListener('pause', handlePause);
        audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
      }
    };
  }, [audioRef.current]);
  
  // Load prompt configuration (dev only)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      fetch('/api/get-prompt')
        .then(res => res.json())
        .then(data => {
          setPromptConfig(data);
          logger("Loaded prompt configuration");
        })
        .catch(err => {
          console.error("Failed to load prompt configuration:", err);
          logger("Failed to load prompt configuration");
        });
    }
  }, []);
  
  // Process pending segments
  const processPendingSegments = (currentSegmentIndex) => {
    // Check if we have segments ready to be displayed
    const readySegments = pendingSegments.filter(
      segment => segment.segmentIndex <= currentSegmentIndex
    );
    
    if (readySegments.length > 0) {
      logger(`Processing ${readySegments.length} pending segments`);
      
      // Add segments to the displayed list
      setContextSegments(prev => [...prev, ...readySegments]);
      
      // Update topics
      readySegments.forEach(segment => {
        if (segment.mainTopic) {
          updateTopTopics(segment.mainTopic);
        }
      });
      
      // Remove processed segments from pending list
      setPendingSegments(prev => 
        prev.filter(segment => segment.segmentIndex > currentSegmentIndex)
      );
      
      // Generate summary if needed
      if ((contextSegments.length + readySegments.length) % 4 === 0) {
        generateSummary();
      }
    }
  };
  
  // Handler for receiving segment data
  const handleSegmentReceived = (segment) => {
    logger(`Received segment #${segment.segmentIndex} from server`);
    
    // For the first segment, add it immediately to show progress
    if (segment.segmentIndex === 0 || contextSegments.length === 0) {
      setContextSegments(prev => [...prev, segment]);
      
      // Update topics if needed
      if (segment.mainTopic) {
        updateTopTopics(segment.mainTopic);
      }
      
      logger(`Added first segment #${segment.segmentIndex} directly to display`);
      return;
    }
    
    // Add subsequent segments to pending list
    setPendingSegments(prev => [...prev, segment]);
    logger(`Added segment #${segment.segmentIndex} to pending queue`);
    
    // Check if we can process it immediately
    if (segment.segmentIndex <= currentSegmentRef.current) {
      processPendingSegments(currentSegmentRef.current);
    }
  };
  
  // Update top topics
  const updateTopTopics = (newTopic) => {
    setTopTopics(prev => {
      // Check if topic exists
      const existingIndex = prev.findIndex(item => item.topic === newTopic);
      
      if (existingIndex >= 0) {
        // Update existing topic
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          count: updated[existingIndex].count + 1
        };
        
        // Sort by count
        return updated.sort((a, b) => b.count - a.count);
      } else {
        // Add new topic
        const updated = [...prev, { topic: newTopic, count: 1 }];
        
        // Sort and limit to top 5
        return updated.sort((a, b) => b.count - a.count).slice(0, 5);
      }
    });
  };
  
  // Generate summary
  const generateSummary = async () => {
    if (contextSegments.length < 4) return;
    
    // Skip API call in debug mode
    if (debugModeEnabled) {
      logger("Debug mode: Skipping summary generation API call");
      setSummary("This is a debug summary. Real API call was skipped to reduce costs.");
      return;
    }
    
    try {
      const recentSegments = contextSegments.slice(-4);
      const combinedTranscript = recentSegments.map(s => s.transcript).join(' ');
      
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: combinedTranscript, summarize: true })
      });
      
      if (response.ok) {
        const data = await response.json();
        setSummary(data.context || 'No summary available.');
        logger("Summary generated successfully");
      }
    } catch (error) {
      logger(`Error generating summary: ${error.message}`);
    }
  };
  
  // Process status update
  const handleStatusUpdate = (data) => {
    setProcessingStatus(data.status);
    setStatusMessage(data.message);
    
    if (data.status === 'error' && data.error) {
      setErrorMessage(data.error);
      setShowError(true);
    }
  };
  
  // Handle error
  const handleError = (data) => {
    logger(`Error: ${data.message || 'Unknown error'}`);
    setErrorMessage(data.message || 'An unknown error occurred');
    setShowError(true);
    setProcessingStatus('error');
  };
  
  // Close existing connections
  const closeConnections = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      logger("Closed SSE connection");
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  
  // Start processing podcast
  const startProcessing = () => {
    if (!audioUrl) {
      setErrorMessage("Please enter a podcast URL");
      setShowError(true);
      logger("No URL provided");
      return;
    }
    
    // Close any existing connections
    closeConnections();
    
    // Reset state
    setContextSegments([]);
    setPendingSegments([]);
    setSummary('');
    setTopTopics([]);
    setProcessingStatus('initializing');
    setStatusMessage('Starting audio processing...');
    currentSegmentRef.current = -1;
    setCurrentTime(0);
    
    logger(`Starting processing for URL: ${audioUrl}`);
    
    // Set up audio element for direct playing
    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      audioRef.current.crossOrigin = "anonymous"; // Enable CORS
      audioRef.current.currentTime = 0;
      logger("Audio element source set");
    }
    
    // Set playback started
    setPlaybackStarted(true);
    
    if (debugModeEnabled) {
      // In debug mode, create mock data and don't use SSE
      logger("Debug mode enabled: Using mock data");
      
      // Create mock segments at the correct intervals
      const mockSegmentCount = 10;
      for (let i = 0; i < mockSegmentCount; i++) {
        const mockData = {
          transcript: `Debug transcript at ${new Date().toISOString().substring(11, 19)}. This is segment ${i}.`,
          context: `This is simulated context for debugging purposes. No API call was made to save costs. The content simulates what would be generated by an AI model analyzing the audio at time index ${i * 15} seconds.`,
          wikipedia: i % 3 === 0 ? { // Only add Wikipedia info to every 3rd segment
            title: "Podcast",
            url: "https://en.wikipedia.org/wiki/Podcast",
            snippet: "A podcast is an episodic series of digital audio files that a user can download or stream to listen to."
          } : null,
          segment: `15-second segment #${i} (Debug Mode)`,
          timestamp: Date.now(),
          mainTopic: `Topic ${i}`,
          segmentIndex: i
        };
        
        // Add to pending segments
        setPendingSegments(prev => [...prev, mockData]);
        logger(`Created mock segment #${i}`);
      }
      
      // Update status
      handleStatusUpdate({
        status: 'ready',
        message: `Created ${mockSegmentCount} mock segments`
      });
      
      // Try to play audio
      if (audioRef.current) {
        audioRef.current.play()
          .then(() => {
            logger("Audio playback started successfully");
          })
          .catch(err => {
            logger(`Failed to start audio playback: ${err.message}`);
            
            // If we can't autoplay, at least prepare for manual play
            setIsPaused(true);
          });
      }
    } else {
      // Set up SSE connection
      const encodedUrl = encodeURIComponent(audioUrl);
      const eventSource = new EventSource(`/api/stream?podcastUrl=${encodedUrl}`);
      eventSourceRef.current = eventSource;
      
      // Set up event handlers
      eventSource.onopen = () => {
        logger("SSE connection opened");
      };
      
      eventSource.addEventListener('message', (event) => {
        try {
          logger(`Received message event: ${event.data.substring(0, 50)}...`);
          const data = JSON.parse(event.data);
          if (data.transcript) {
            handleSegmentReceived(data);
          } else {
            logger(`Received non-transcript message: ${JSON.stringify(data)}`);
          }
        } catch (err) {
          console.error('Error parsing SSE data:', err);
          logger(`Error parsing SSE data: ${err.message}`);
        }
      });
      
      eventSource.addEventListener('status', (event) => {
        try {
          const data = JSON.parse(event.data);
          handleStatusUpdate(data);
          logger(`Status update: ${data.status} - ${data.message}`);
          
          // If streaming is ready, try to play audio
          if (data.status === 'streaming' && audioRef.current) {
            audioRef.current.play()
              .then(() => {
                logger("Audio playback started successfully");
              })
              .catch(err => {
                logger(`Failed to start audio playback: ${err.message}`);
                
                // If we can't autoplay, at least prepare for manual play
                setIsPaused(true);
              });
          }
        } catch (err) {
          console.error('Error parsing status event:', err);
          logger(`Error parsing status event: ${err.message}`);
        }
      });
      
      eventSource.addEventListener('log', (event) => {
        try {
          const data = JSON.parse(event.data);
          logger(data.message || event.data);
        } catch (err) {
          logger(event.data);
        }
      });
      
      eventSource.onerror = (err) => {
        console.error('EventSource error:', err);
        logger('SSE connection error');
        handleError({ message: 'Connection to server lost' });
      };
      
      // Always set up audio immediately for both local and remote files
      if (audioRef.current) {
        logger(`Setting up audio for URL: ${audioUrl}`);
        audioRef.current.src = audioUrl;
        audioRef.current.crossOrigin = "anonymous";
        
        // Try to play audio immediately
        setTimeout(() => {
          audioRef.current.play()
            .then(() => {
              logger("Audio playback started via direct play");
              setIsPaused(false);
            })
            .catch(err => {
              logger(`Error starting audio: ${err.message}. User may need to click play.`);
              setIsPaused(true);
            });
        }, 1000); // Give a short delay to ensure UI has updated
      }
    }
  };
  
  // Handle tab change
  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
  };
  
  // Jump to segment
  const jumpToSegment = (index) => {
    if (audioRef.current && index >= 0 && index < contextSegments.length) {
      // Estimate time based on segment index
      const estimatedTime = index * 15; // 15 seconds per segment
      audioRef.current.currentTime = estimatedTime;
      setCurrentTime(estimatedTime);
      currentSegmentRef.current = index;
      logger(`Jumped to segment ${index} (time: ${estimatedTime}s)`);
    }
  };
  
  // Play/pause controls
  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPaused) {
        audioRef.current.play()
          .then(() => logger("Playback resumed"))
          .catch(err => logger(`Play error: ${err.message}`));
      } else {
        audioRef.current.pause();
        logger("Playback paused");
      }
    }
  };
  
  const skipForward = (seconds = 15) => {
    if (audioRef.current) {
      audioRef.current.currentTime += seconds;
      setCurrentTime(audioRef.current.currentTime);
      logger(`Skipped forward ${seconds} seconds`);
    }
  };
  
  const skipBackward = (seconds = 15) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - seconds);
      setCurrentTime(audioRef.current.currentTime);
      logger(`Skipped backward ${seconds} seconds`);
    }
  };
  
  // Save prompt configuration
  const savePromptConfig = async () => {
    try {
      const res = await fetch('/api/update-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promptConfig),
      });
      
      const data = await res.json();
      logger("Prompt configuration updated");
    } catch (err) {
      console.error("Error updating prompt config:", err);
      logger(`Error updating prompt config: ${err.message}`);
    }
  };
  
  // Toggle debug mode
  const toggleDebugMode = (enabled) => {
    setDebugModeEnabled(enabled);
    logger(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  };
  
  // Format time for display
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      closeConnections();
    };
  }, []);
  
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
          
          {/* Debug mode toggle */}
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Checkbox
              checked={debugModeEnabled}
              onChange={(e) => toggleDebugMode(e.target.checked)}
            />
            <Typography variant="body2" color="text.secondary">
              Debug mode (reduces API usage)
            </Typography>
          </Box>
          
          {/* Start button with loading indicator */}
          <Button 
            variant="contained" 
            onClick={startProcessing}
            sx={{ mb: 2, width: '100%' }}
            disabled={
              processingStatus === 'initializing' || 
              processingStatus === 'processing'
            }
          >
            {(processingStatus === 'initializing' || processingStatus === 'processing') ? (
              <>
                <LoadingIndicator loading={true} />
              </>
            ) : (
              'Start Listening'
            )}
          </Button>
          
          {/* Status indicator */}
          <StatusIndicator 
            status={processingStatus}
            message={statusMessage}
            visible={processingStatus !== 'idle'}
          />
          
          {/* Audio player */}
          {playbackStarted && (
            <>
              <Paper elevation={0} sx={{ p: 2, mb: 2, bgcolor: '#f9f9f9', borderRadius: 2 }}>
                {/* Custom controls */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
                  <IconButton onClick={() => skipBackward(15)}>
                    <SkipPreviousIcon />
                  </IconButton>
                  
                  <IconButton 
                    onClick={togglePlayPause}
                    sx={{ mx: 1 }}
                  >
                    {isPaused ? <PlayArrowIcon fontSize="large" /> : <PauseIcon fontSize="large" />}
                  </IconButton>
                  
                  <IconButton onClick={() => skipForward(15)}>
                    <SkipNextIcon />
                  </IconButton>
                </Box>
                
                {/* Current time display */}
                <Typography textAlign="center" variant="body2" color="text.secondary" gutterBottom>
                  {formatTime(currentTime)}
                </Typography>
                
                {/* Audio element now visible for testing */}
                <audio
                  ref={audioRef}
                  controls
                  style={{ width: '100%', marginBottom: '10px' }}
                  crossOrigin="anonymous"
                />
              </Paper>
              
              {/* Topic overview */}
              <TopicsList 
                topics={topTopics}
                visible={topTopics.length > 0}
              />
              
              {/* Summary */}
              {summary && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle1" gutterBottom>Recent Summary</Typography>
                  <Typography variant="body2">{summary}</Typography>
                </Box>
              )}
            </>
          )}
          
          {/* Prompt editor (dev only) */}
          <PromptEditor
            promptConfig={promptConfig}
            onConfigChange={setPromptConfig}
            onSave={savePromptConfig}
          />
        </Box>
        
        {/* Right Panel: Context Timeline, Transcript, and Debug Info */}
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
            <ContextTimeline
              segments={contextSegments}
              currentSegmentIndex={currentSegmentRef.current}
              onSegmentClick={jumpToSegment}
            />
          </Box>
          
          {/* Transcript Tab */}
          <Box 
            role="tabpanel"
            hidden={currentTab !== 1}
            sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}
          >
            <TranscriptView
              segments={contextSegments}
              currentSegmentIndex={currentSegmentRef.current}
              onSegmentClick={jumpToSegment}
            />
          </Box>
          
          {/* Debug Tab */}
          <Box 
            role="tabpanel"
            hidden={currentTab !== 2}
            sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}
          >
            <DebugPanel logs={logs} />
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
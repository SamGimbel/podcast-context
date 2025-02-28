import { useState, useCallback, useEffect, useRef } from 'react';
import { isDirectAudioUrl, isSpotifyUrl } from '../utils/audioUtils';
import { resetSeenTopics } from '../utils/wikiUtils';

/**
 * Hook for managing podcast audio processing
 */
export default function useAudioProcessing({
  logger,
  debugMode,
  segmentTiming,
  sseConnection,
  generateMockData
}) {
  // State
  const [audioUrl, setAudioUrl] = useState('');
  const [playbackStarted, setPlaybackStarted] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [contextSegments, setContextSegments] = useState([]);
  const [summary, setSummary] = useState('');
  const [topTopics, setTopTopics] = useState([]);
  
  // Refs
  const pendingSegmentsRef = useRef([]);
  
  // Update the audioUrl
  const updateAudioUrl = useCallback((url) => {
    setAudioUrl(url);
  }, []);
  
  // Handle status updates
  const handleStatus = useCallback((data) => {
    setProcessingStatus(data.status);
    setStatusMessage(data.message);
    
    if (data.status === 'error' && data.error) {
      setErrorMessage(data.error);
      setShowError(true);
    }
  }, []);
  
  // Handle errors
  const handleError = useCallback((data) => {
    logger(`Error: ${data.message || 'Unknown error'}`);
    setErrorMessage(data.message || 'An unknown error occurred');
    setShowError(true);
    setProcessingStatus('error');
  }, [logger]);
  
  // Add a segment to the timeline
  const addSegment = useCallback((segment) => {
    // Add the segment to the pending queue
    pendingSegmentsRef.current.push({
      ...segment,
      addedAt: Date.now()
    });
    
    logger(`Added segment to pending queue. Current queue size: ${pendingSegmentsRef.current.length}`);
  }, [logger]);
  
  // Process pending segments based on current playback time
  useEffect(() => {
    if (!segmentTiming.shouldProcessSegment || pendingSegmentsRef.current.length === 0) {
      return;
    }
    
    logger(`Processing segment ${segmentTiming.currentSegmentIndex}`);
    
    // Get the next segment from the queue
    const segment = pendingSegmentsRef.current.shift();
    
    // Add to visible segments
    setContextSegments(prev => [...prev, segment]);
    
    // Update processing status
    setProcessingStatus('ready');
    setStatusMessage(`Processed segment ${segmentTiming.currentSegmentIndex}`);
    
    // Update topics if needed
    if (segment.mainTopic) {
      updateTopTopics(segment.mainTopic);
    }
    
  }, [segmentTiming.shouldProcessSegment, segmentTiming.currentSegmentIndex, logger]);
  
  // Update the list of top topics
  const updateTopTopics = useCallback((newTopic) => {
    setTopTopics(prev => {
      // Check if the topic already exists
      const existingIndex = prev.findIndex(item => item.topic === newTopic);
      
      if (existingIndex >= 0) {
        // Update count for existing topic
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
        
        // Sort by count and limit to top 5
        return updated.sort((a, b) => b.count - a.count).slice(0, 5);
      }
    });
  }, []);
  
  // Generate a summary from recent segments
  const generateSummary = useCallback(async () => {
    if (contextSegments.length < 4) return;
    
    // Skip API call in debug mode
    if (debugMode) {
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
  }, [contextSegments, debugMode, logger]);
  
  // Start processing a podcast
  const startProcessing = useCallback(() => {
    if (!audioUrl) {
      setErrorMessage("Please enter a podcast URL");
      setShowError(true);
      logger("No URL provided");
      return;
    }
    
    // Reset state
    setContextSegments([]);
    pendingSegmentsRef.current = [];
    resetSeenTopics();
    setSummary('');
    setTopTopics([]);
    setProcessingStatus('initializing');
    setStatusMessage('Starting audio processing...');
    segmentTiming.resetSegmentTracking();
    
    logger(`Starting processing for URL: ${audioUrl}`);
    
    // Determine URL type (though we're using server-side for all now)
    const urlType = isSpotifyUrl(audioUrl) ? 'spotify' : 'other';
    logger(`URL type: ${urlType}`);
    
    // Start the SSE connection
    sseConnection.startConnection(audioUrl, addSegment);
    
    // Set playback started
    setPlaybackStarted(true);
    
    // In debug mode, we need to create some initial segments
    if (debugMode) {
      // Pre-generate a few segments for the queue
      for (let i = 0; i < 5; i++) {
        addSegment(generateMockData(i));
      }
    }
  }, [audioUrl, logger, debugMode, segmentTiming, sseConnection, addSegment, generateMockData]);
  
  // Stop processing
  const stopProcessing = useCallback(() => {
    logger("Stopping podcast processing");
    sseConnection.stopConnection();
    segmentTiming.pause();
    pendingSegmentsRef.current = [];
    setProcessingStatus('idle');
    setStatusMessage('');
    setPlaybackStarted(false);
  }, [logger, sseConnection, segmentTiming]);
  
  // Effect to generate summary when we have enough segments
  useEffect(() => {
    if (contextSegments.length >= 4 && contextSegments.length % 4 === 0) {
      generateSummary();
    }
  }, [contextSegments, generateSummary]);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      sseConnection.stopConnection();
    };
  }, [sseConnection]);
  
  return {
    audioUrl,
    updateAudioUrl,
    playbackStarted,
    processingStatus,
    statusMessage,
    errorMessage,
    showError,
    setShowError,
    contextSegments,
    summary,
    topTopics,
    startProcessing,
    stopProcessing,
    handleStatus,
    handleError
  };
}
import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Hook for managing segment timing with the audio player
 * @param {Function} logger - Logging function
 * @param {Object} options - Configuration options
 * @returns {Object} Segment timing state and functions
 */
export default function useSegmentTiming(logger, options = {}) {
  const {
    segmentDuration = 15, // Duration of each segment in seconds
    initialDelay = 2 // Initial delay before first segment in seconds
  } = options;
  
  const [currentTime, setCurrentTime] = useState(0);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(-1);
  const [isPaused, setIsPaused] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [shouldProcessSegment, setShouldProcessSegment] = useState(false);
  
  const lastProcessedSegment = useRef(-1);
  const audioRef = useRef(null);
  const timerRef = useRef(null);
  
  // Register audio element ref
  const registerAudioElement = useCallback((audioElement) => {
    audioRef.current = audioElement;
    
    if (audioElement) {
      // Set up event listeners
      audioElement.addEventListener('play', () => setIsPaused(false));
      audioElement.addEventListener('pause', () => setIsPaused(true));
      audioElement.addEventListener('waiting', () => setIsBuffering(true));
      audioElement.addEventListener('canplay', () => setIsBuffering(false));
      audioElement.addEventListener('timeupdate', () => setCurrentTime(audioElement.currentTime));
      
      logger('Audio element registered');
    }
  }, [logger]);
  
  // Calculate current segment based on current time
  useEffect(() => {
    const newSegmentIndex = Math.floor(currentTime / segmentDuration);
    
    if (newSegmentIndex !== currentSegmentIndex) {
      setCurrentSegmentIndex(newSegmentIndex);
      logger(`Current segment changed to ${newSegmentIndex}`);
    }
    
    // Check if we need to process a new segment
    if (newSegmentIndex > lastProcessedSegment.current && currentTime >= initialDelay) {
      lastProcessedSegment.current = newSegmentIndex;
      setShouldProcessSegment(true);
      logger(`Triggering processing for segment ${newSegmentIndex}`);
    } else {
      setShouldProcessSegment(false);
    }
  }, [currentTime, currentSegmentIndex, segmentDuration, initialDelay, logger]);
  
  // Function to jump to a specific segment
  const jumpToSegment = useCallback((index) => {
    if (!audioRef.current) return;
    
    const newTime = index * segmentDuration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    
    logger(`Jumped to segment ${index} (time: ${newTime}s)`);
  }, [segmentDuration, logger]);
  
  // Reset segment tracking
  const resetSegmentTracking = useCallback(() => {
    lastProcessedSegment.current = -1;
    setCurrentSegmentIndex(-1);
    setShouldProcessSegment(false);
    logger('Segment tracking reset');
  }, [logger]);
  
  // Start or resume playback
  const play = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play()
        .then(() => logger('Playback started'))
        .catch(err => logger(`Playback error: ${err.message}`));
    }
  }, [logger]);
  
  // Pause playback
  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      logger('Playback paused');
    }
  }, [logger]);
  
  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    if (isPaused) {
      play();
    } else {
      pause();
    }
  }, [isPaused, play, pause]);
  
  // Skip forward
  const skipForward = useCallback((seconds = 15) => {
    if (audioRef.current) {
      audioRef.current.currentTime += seconds;
      logger(`Skipped forward ${seconds} seconds`);
    }
  }, [logger]);
  
  // Skip backward
  const skipBackward = useCallback((seconds = 15) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - seconds);
      logger(`Skipped backward ${seconds} seconds`);
    }
  }, [logger]);
  
  // Clean up
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      // Remove event listeners if needed
      if (audioRef.current) {
        // Could remove event listeners here if needed
      }
    };
  }, []);
  
  return {
    currentTime,
    currentSegmentIndex,
    isPaused,
    isBuffering,
    shouldProcessSegment,
    registerAudioElement,
    jumpToSegment,
    resetSegmentTracking,
    play,
    pause,
    togglePlayPause,
    skipForward,
    skipBackward,
    audioRef
  };
}
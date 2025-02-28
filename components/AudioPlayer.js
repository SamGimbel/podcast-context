import React, { useEffect } from 'react';
import { Box, Paper, IconButton } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';

/**
 * Audio player component with custom controls
 */
const AudioPlayer = ({ segmentTiming, audioUrl, visible = true }) => {
  const { 
    isPaused,
    isBuffering,
    registerAudioElement,
    togglePlayPause,
    skipForward,
    skipBackward,
    audioRef
  } = segmentTiming;

  // Set up audio element reference
  useEffect(() => {
    if (audioRef.current) {
      registerAudioElement(audioRef.current);
    }
  }, [audioRef, registerAudioElement]);

  if (!visible) return null;

  return (
    <Paper elevation={0} sx={{ p: 2, mb: 2, bgcolor: '#f9f9f9', borderRadius: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
        <IconButton 
          onClick={() => skipBackward(15)}
          disabled={isBuffering}
        >
          <SkipPreviousIcon />
        </IconButton>
        
        <IconButton 
          onClick={togglePlayPause}
          sx={{ mx: 1 }}
          disabled={isBuffering}
        >
          {isPaused ? <PlayArrowIcon fontSize="large" /> : <PauseIcon fontSize="large" />}
        </IconButton>
        
        <IconButton 
          onClick={() => skipForward(15)}
          disabled={isBuffering}
        >
          <SkipNextIcon />
        </IconButton>
      </Box>
      
      {/* Hidden audio element - only used by the player logic */}
      <audio
        src={audioUrl}
        ref={audioRef}
        style={{ display: 'none' }}
        crossOrigin="anonymous"
      />
    </Paper>
  );
};

export default AudioPlayer;
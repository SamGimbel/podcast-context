import React, { useEffect, useState } from 'react';
import { Box, Paper, IconButton, Slider } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeDownIcon from '@mui/icons-material/VolumeDown';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';

/**
 * Audio player component with custom controls
 */
const AudioPlayer = ({ segmentTiming, audioUrl, visible = true }) => {
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  
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
  
  // Handle volume change
  const handleVolumeChange = (event, newValue) => {
    setVolume(newValue);
    
    if (audioRef.current) {
      audioRef.current.volume = newValue;
      
      // If we're adjusting volume and it was muted, unmute it
      if (muted && newValue > 0) {
        setMuted(false);
        audioRef.current.muted = false;
      }
    }
  };
  
  // Toggle mute
  const toggleMute = () => {
    const newMutedState = !muted;
    setMuted(newMutedState);
    
    if (audioRef.current) {
      audioRef.current.muted = newMutedState;
    }
  };
  
  // Get the appropriate volume icon based on current state
  const getVolumeIcon = () => {
    if (muted || volume === 0) {
      return <VolumeOffIcon />;
    } else if (volume < 0.5) {
      return <VolumeDownIcon />;
    } else {
      return <VolumeUpIcon />;
    }
  };

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
      
      {/* Volume controls */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
        <IconButton onClick={toggleMute} size="small">
          {getVolumeIcon()}
        </IconButton>
        
        <Slider
          value={volume}
          onChange={handleVolumeChange}
          aria-label="Volume"
          min={0}
          max={1}
          step={0.01}
          sx={{ 
            width: '60%', 
            mx: 1,
            '& .MuiSlider-thumb': {
              width: 16,
              height: 16,
            }
          }}
        />
      </Box>
      
      {/* Audio element - hidden but functional */}
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

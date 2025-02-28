import React from 'react';
import { Box, Typography } from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import { formatTime } from '../utils/audioUtils';

/**
 * Component to display transcript of audio segments
 */
const TranscriptView = ({ 
  segments = [], 
  currentSegmentIndex, 
  onSegmentClick,
  segmentDuration = 15
}) => {
  // If no segments, show placeholder
  if (segments.length === 0) {
    return (
      <Box 
        sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          height: '100%',
          color: 'text.secondary'
        }}
      >
        <InfoIcon sx={{ fontSize: 60, opacity: 0.3, mb: 2 }} />
        <Typography>Start playing a podcast to see transcript</Typography>
      </Box>
    );
  }
  
  return (
    <Box>
      {segments.map((segment, idx) => (
        <Box 
          key={idx}
          onClick={() => onSegmentClick(idx)}
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
            [{formatTime(idx * segmentDuration)}]
          </Typography>
          <Typography component="span">
            {segment.transcript}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};

export default TranscriptView;
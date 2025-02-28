import React from 'react';
import { Box, Typography, Paper, Divider } from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import WikipediaIcon from '@mui/icons-material/Language';
import TimestampIcon from '@mui/icons-material/Schedule';
import { formatTime } from '../utils/audioUtils';

/**
 * Component to display timeline of context segments
 */
const ContextTimeline = ({ 
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
        <Typography>Start playing a podcast to see AI-generated context</Typography>
      </Box>
    );
  }
  
  // Format time for a segment
  const getSegmentTime = (index) => {
    const seconds = index * segmentDuration;
    return formatTime(seconds);
  };
  
  return (
    <Box>
      {segments.map((segment, idx) => (
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
          onClick={() => onSegmentClick(idx)}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="subtitle1" fontWeight="bold">
              {segment.mainTopic || `Segment ${idx + 1}`}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <TimestampIcon fontSize="small" sx={{ mr: 0.5, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                {getSegmentTime(idx)}
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
      ))}
    </Box>
  );
};

export default ContextTimeline;
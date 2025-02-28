import React from 'react';
import { Box, Typography, Chip } from '@mui/material';

/**
 * Component to display list of key topics
 */
const TopicsList = ({ topics = [], visible = true }) => {
  if (!visible || topics.length === 0) return null;
  
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle1" gutterBottom>Key Topics</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {topics.map((topic, idx) => (
          <Chip 
            key={idx} 
            label={topic.topic} 
            size="small"
            color={idx === 0 ? "primary" : "default"}
          />
        ))}
      </Box>
    </Box>
  );
};

export default TopicsList;
import React from 'react';
import { Box, Typography, Link } from '@mui/material';
import WikipediaIcon from '@mui/icons-material/Language';

/**
 * Component to display Wikipedia information
 */
const WikipediaInfo = ({ info, visible = true }) => {
  if (!visible || !info) return null;
  
  return (
    <Box sx={{ mt: 1, display: 'flex', alignItems: 'flex-start' }}>
      <WikipediaIcon fontSize="small" sx={{ mr: 1, mt: 0.5, color: 'text.secondary' }} />
      <Box>
        <Link 
          href={info.url} 
          target="_blank"
          rel="noopener noreferrer"
          color="primary"
          sx={{ textDecoration: 'none' }}
        >
          {info.title}
        </Link>
        
        {info.snippet && (
          <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
            {info.snippet}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default WikipediaInfo;
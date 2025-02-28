import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Component to display debug information
 */
const DebugPanel = ({ logs = [] }) => {
  return (
    <Box>
      <Typography variant="h6" gutterBottom>Debug Information</Typography>
      
      {logs.map((log, idx) => (
        <Typography key={idx} variant="caption" display="block" sx={{ mb: 0.5 }}>
          {log}
        </Typography>
      ))}
      
      {logs.length === 0 && (
        <Typography color="text.secondary">No logs yet</Typography>
      )}
    </Box>
  );
};

export default DebugPanel;
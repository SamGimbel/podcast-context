import React from 'react';
import { Box, LinearProgress, Typography, CircularProgress } from '@mui/material';

/**
 * Status indicator component for processing status
 */
const StatusIndicator = ({ status, message, visible = true }) => {
  if (!visible) return null;
  
  const isProcessing = status === 'initializing' || status === 'processing';
  const isError = status === 'error';
  const isReady = status === 'ready';
  
  return (
    <Box sx={{ mb: 2 }}>
      <LinearProgress 
        variant={isProcessing ? 'indeterminate' : 'determinate'} 
        value={isReady ? 100 : 0}
        color={isError ? 'error' : 'primary'}
      />
      <Typography variant="caption" color="text.secondary">
        {message || 'Ready'}
      </Typography>
    </Box>
  );
};

/**
 * Loading button indicator
 */
export const LoadingIndicator = ({ loading, children }) => {
  if (!loading) return children;
  
  return (
    <>
      <CircularProgress size={24} sx={{ mr: 1, color: 'white' }} />
      Processing...
    </>
  );
};

export default StatusIndicator;
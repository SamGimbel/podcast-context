import { useRef, useCallback, useEffect } from 'react';

/**
 * Hook for managing SSE (Server-Sent Events) connection
 * @param {Object} options - Configuration options
 * @returns {Object} SSE connection functions and state
 */
export default function useSSEConnection({ 
  onMessage, 
  onStatus, 
  onError, 
  onLog,
  debugMode,
  generateMockData,
  logger
}) {
  const eventSourceRef = useRef(null);
  const debugIntervalRef = useRef(null);
  
  // Cleanup function for closing connections
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      logger('SSE connection closed');
    }
    
    if (debugIntervalRef.current) {
      clearInterval(debugIntervalRef.current);
      debugIntervalRef.current = null;
      logger('Debug interval cleared');
    }
  }, [logger]);
  
  // Clean up on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);
  
  // Setup debug mode simulation
  const setupDebugConnection = useCallback((segmentCallback) => {
    logger('Debug mode: Using simulated SSE connection');
    
    // Set initial status
    if (onStatus) {
      onStatus({
        status: 'processing',
        message: 'Processing in debug mode...'
      });
    }
    
    let segmentIndex = 0;
    
    // Simulate SSE connection with interval
    const debugInterval = setInterval(() => {
      const mockData = generateMockData(segmentIndex);
      
      // Call segment callback with mock data
      segmentCallback(mockData);
      logger(`Debug mode: Generated mock segment ${segmentIndex}`);
      
      // Increment segment index
      segmentIndex++;
      
      // Stop after generating some segments
      if (segmentIndex >= 10) {
        clearInterval(debugInterval);
        
        if (onStatus) {
          onStatus({
            status: 'ready',
            message: 'Debug processing complete'
          });
        }
        
        logger('Debug mode: Finished generating mock segments');
      }
    }, 15000); // Every 15 seconds
    
    debugIntervalRef.current = debugInterval;
    
    // Return a mock event source object
    return {
      close: () => {
        clearInterval(debugInterval);
        logger('Debug mode: Closed mock SSE connection');
      }
    };
  }, [generateMockData, logger, onStatus]);
  
  // Setup real SSE connection
  const setupSSEConnection = useCallback((url, segmentCallback) => {
    logger(`Setting up SSE connection for URL: ${url}`);
    
    // Close any existing connection
    if (eventSourceRef.current) {
      logger('Closing existing SSE connection');
      eventSourceRef.current.close();
    }
    
    const encodedUrl = encodeURIComponent(url);
    logger(`Encoded URL: ${encodedUrl}`);
    
    const sseUrl = `/api/stream?podcastUrl=${encodedUrl}`;
    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;
    
    logger('EventSource created');
    
    // Set up event handlers
    eventSource.onopen = () => {
      logger('SSE connection opened');
    };
    
    eventSource.addEventListener('message', (event) => {
      logger(`Message received: ${event.data.substring(0, 50)}...`);
      
      try {
        const data = JSON.parse(event.data);
        
        if (data.transcript) {
          // Call the provided callback with the segment data
          segmentCallback(data);
          logger(`Received segment: ${data.segment}`);
        }
        
        if (onMessage) {
          onMessage(data);
        }
      } catch (err) {
        console.error('Error parsing SSE data:', err);
        logger(`Error parsing SSE data: ${err.message}`);
        
        if (onError) {
          onError({
            error: 'Failed to parse SSE data',
            message: err.message
          });
        }
      }
    });
    
    eventSource.addEventListener('status', (event) => {
      try {
        const data = JSON.parse(event.data);
        logger(`Status update: ${data.status} - ${data.message}`);
        
        if (onStatus) {
          onStatus(data);
        }
      } catch (err) {
        console.error('Error parsing status event:', err);
        logger(`Error parsing status event: ${err.message}`);
      }
    });
    
    eventSource.addEventListener('log', (event) => {
      try {
        const data = JSON.parse(event.data);
        logger(data.message || event.data);
        
        if (onLog) {
          onLog(data);
        }
      } catch (err) {
        logger(event.data);
        
        if (onLog) {
          onLog({ message: event.data });
        }
      }
    });
    
    eventSource.onerror = (err) => {
      console.error('EventSource error:', err);
      logger('SSE connection error');
      
      if (eventSource.readyState === EventSource.CLOSED) {
        logger('SSE connection closed');
        
        if (onStatus) {
          onStatus({
            status: 'error',
            message: 'Connection closed'
          });
        }
      }
      
      if (onError) {
        onError({
          error: 'SSE connection error',
          message: 'The connection to the server was lost'
        });
      }
    };
    
    return eventSource;
  }, [logger, onError, onLog, onMessage, onStatus]);
  
  // Start SSE connection
  const startConnection = useCallback((url, segmentCallback) => {
    // Use debug mode if enabled
    if (debugMode) {
      eventSourceRef.current = setupDebugConnection(segmentCallback);
    } else {
      eventSourceRef.current = setupSSEConnection(url, segmentCallback);
    }
    
    return () => cleanup();
  }, [debugMode, cleanup, setupDebugConnection, setupSSEConnection]);
  
  // Stop SSE connection
  const stopConnection = useCallback(() => {
    cleanup();
  }, [cleanup]);
  
  return {
    startConnection,
    stopConnection,
    isConnected: !!eventSourceRef.current
  };
}
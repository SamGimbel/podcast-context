/**
 * Utility functions for logging
 */

/**
 * Creates a logging function that logs to both console and state
 * @param {Function} setLogs - State setter function for logs
 * @returns {Function} Logging function
 */
export const createLogger = (setLogs) => {
  return (message) => {
    const timestamp = new Date().toISOString().substring(11, 19);
    const logEntry = `${timestamp} - ${message}`;
    console.log(logEntry);
    setLogs(prev => [...prev, logEntry]);
  };
};
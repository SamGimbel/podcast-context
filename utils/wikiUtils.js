/**
 * Utility functions for Wikipedia data
 */

/**
 * Extract main topic from context block
 * @param {string} contextBlock - Context text that may include MAIN_TOPIC
 * @returns {string} Extracted main topic
 */
export function extractMainTopic(contextBlock) {
  if (!contextBlock) return "";
  
  // First try to extract the explicit main topic tag
  const lines = contextBlock.split('\n');
  for (const line of lines) {
    if (line.trim().startsWith("MAIN_TOPIC:")) {
      return line.replace("MAIN_TOPIC:", "").trim();
    }
  }
  
  // If no explicit tag, try to extract a meaningful topic
  // This is a simple implementation and could be improved
  const words = contextBlock.split(' ');
  const significantPhraseLength = 3;
  
  if (words.length >= significantPhraseLength) {
    // Get the first few words as they often contain the main subject
    return words.slice(0, significantPhraseLength).join(' ');
  }
  
  return contextBlock.slice(0, 30).trim(); // Fallback to first 30 chars
}

/**
 * Tracks seen topics to avoid duplicate Wikipedia lookups
 */
let seenTopics = new Set();

/**
 * Reset the seen topics cache
 */
export function resetSeenTopics() {
  seenTopics.clear();
}

/**
 * Check if a topic has already been processed for Wikipedia
 * @param {string} topic - Topic to check
 * @returns {boolean} True if topic is new
 */
export function isNewTopic(topic) {
  if (!topic || seenTopics.has(topic)) {
    return false;
  }
  seenTopics.add(topic);
  return true;
}
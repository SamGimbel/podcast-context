// pages/api/simple-stream.js
export default async function handler(req, res) {
  console.log("Simple stream API handler called");
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Get the podcast URL from query
  const { podcastUrl } = req.query;
  console.log("Received podcast URL:", podcastUrl);

  // Send initial message
  res.write(`event: message\n`);
  res.write(`data: ${JSON.stringify({ message: "Connection established" })}\n\n`);

  // Send status update
  res.write(`event: status\n`);
  res.write(`data: ${JSON.stringify({ status: 'initializing', message: 'Setting up...' })}\n\n`);

  // Set up interval to send messages
  let count = 0;
  const interval = setInterval(() => {
    count++;
    console.log(`Sending message #${count}`);
    
    // Send a test message
    res.write(`event: message\n`);
    res.write(`data: ${JSON.stringify({ 
      message: `Test message ${count}`,
      timestamp: Date.now(),
      podcastUrl: podcastUrl
    })}\n\n`);
    
    // End after 5 messages
    if (count >= 5) {
      clearInterval(interval);
      res.write(`event: status\n`);
      res.write(`data: ${JSON.stringify({ status: 'complete', message: 'Test complete' })}\n\n`);
      res.end();
    }
  }, 2000);

  // Handle connection close
  req.on('close', () => {
    console.log("Connection closed by client");
    clearInterval(interval);
  });
}
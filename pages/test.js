// pages/test.js
import { useState } from 'react';

export default function Test() {
  const [logs, setLogs] = useState([]);
  
  const testSSE = () => {
    setLogs(prev => [...prev, "Starting SSE test"]);
    
    const eventSource = new EventSource('/api/stream?podcastUrl=' + 
      encodeURIComponent('https://www.podtrac.com/pts/redirect.mp3/dovetail.prxu.org/7057/732fbbee-6547-4ed9-997d-3fd77ddc05db/darknet-diaries-ep154-hijacked-line.mp3'));
    
    eventSource.onopen = () => {
      setLogs(prev => [...prev, "SSE connection opened"]);
    };
    
    eventSource.onerror = (err) => {
      setLogs(prev => [...prev, "SSE error: " + JSON.stringify(err)]);
    };
    
    eventSource.onmessage = (event) => {
      setLogs(prev => [...prev, "SSE message: " + event.data]);
    };
  };
  
  return (
    <div>
      <h1>Simple SSE Test</h1>
      <button onClick={testSSE}>Test SSE Connection</button>
      <div>
        <h2>Logs:</h2>
        {logs.map((log, idx) => (
          <div key={idx}>{log}</div>
        ))}
      </div>
    </div>
  );
}
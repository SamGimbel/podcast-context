// pages/index.js
import { useState, useEffect } from 'react';

export default function Home() {
  const [podcastUrl, setPodcastUrl] = useState('');
  const [streamData, setStreamData] = useState([]);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    let eventSource;
    if (listening) {
      // Connect to the SSE endpoint and pass the podcast URL as a query parameter.
      eventSource = new EventSource('/api/stream?podcastUrl=' + encodeURIComponent(podcastUrl));
      eventSource.onmessage = (e) => {
        const parsed = JSON.parse(e.data);
        setStreamData((prev) => [...prev, parsed]);
      };
      eventSource.onerror = (err) => {
        console.error("EventSource error:", err);
        eventSource.close();
      };
    }
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [listening, podcastUrl]);

  const handleStart = () => {
    if (podcastUrl) {
      setStreamData([]);
      setListening(true);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Left Panel: Podcast selection */}
      <div style={{ flex: 1, padding: '20px' }}>
        <h1>Podcast Context MVP</h1>
        <input
          type="text"
          placeholder="Enter podcast audio URL"
          value={podcastUrl}
          onChange={(e) => setPodcastUrl(e.target.value)}
          style={{ width: '100%', padding: '10px' }}
        />
        <button onClick={handleStart} style={{ marginTop: '10px', padding: '10px' }}>
          Start Listening
        </button>
      </div>
      {/* Right Panel: Scrolling context timeline */}
      <div style={{ flex: 1, padding: '20px', borderLeft: '1px solid #ccc', overflowY: 'scroll' }}>
        <h2>Context Timeline</h2>
        {streamData.map((item, index) => (
          <div key={index} style={{ marginBottom: '15px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
            <p><strong>Transcript Segment:</strong> {item.transcript}</p>
            <p><strong>Context:</strong> {item.context}</p>
            {item.wikipedia && (
              <p>
                <strong>Wikipedia:</strong>{' '}
                <a href={item.wikipedia.url} target="_blank" rel="noopener noreferrer">
                  {item.wikipedia.title}
                </a>
              </p>
            )}
          </div>
        ))}
        <button onClick={() => window.scrollTo(0, document.body.scrollHeight)}>Scroll to Latest</button>
      </div>
    </div>
  );
}

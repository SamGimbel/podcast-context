// pages/api/stream.js
import { config } from '../../config';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { Vosk } from 'vosk';

// Define the path to the Vosk model
const MODEL_PATH = path.join(process.cwd(), 'model');

let model;
if (fs.existsSync(MODEL_PATH)) {
  model = new Vosk.Model(MODEL_PATH);
} else {
  console.error("Vosk model not found. Please download and place the model in the 'model' directory.");
}

export default async function handler(req, res) {
  // Set up Server-Sent Events (SSE) headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Retrieve the podcast URL from the query string
  const { podcastUrl } = req.query;
  if (!podcastUrl) {
    res.write(`data: ${JSON.stringify({ error: 'Missing podcast URL' })}\n\n`);
    res.end();
    return;
  }

  try {
    // For MVP purposes, download the full audio file first.
    // (In a full implementation, you would process the audio stream in real time.)
    const response = await fetch(podcastUrl);
    if (!response.ok) {
      res.write(`data: ${JSON.stringify({ error: 'Failed to fetch audio file' })}\n\n`);
      res.end();
      return;
    }
    const buffer = await response.buffer();
    const tempFilePath = path.join('/tmp', 'podcast_audio.wav');
    fs.writeFileSync(tempFilePath, buffer);

    // Simulate segmentation by creating dummy segments.
    // In a production setup, use Vosk with silence detection to segment the audio.
    const segments = [
      { transcript: "This is the first segment of the podcast.", time: 30 },
      { transcript: "This is the second segment discussing various topics.", time: 60 },
      { transcript: "This is the final segment with closing remarks.", time: 90 },
    ];

    // Process each segment, simulating a 5-second delay between segments.
    for (const segment of segments) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Call OpenAI's ChatGPT API to generate context for the transcript segment.
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: `Provide background context for: ${segment.transcript}` }],
          max_tokens: 100,
        }),
      });
      const openaiData = await openaiResponse.json();
      const context = openaiData.choices ? openaiData.choices[0].message.content.trim() : "No context available.";

      // Use the Wikipedia API to search for a related article.
      // (For simplicity, use the first word of the transcript as a search term.)
      const searchTerm = segment.transcript.split(' ')[0];
      const wikipediaRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerm)}&format=json`);
      const wikipediaData = await wikipediaRes.json();
      let wikipediaInfo = null;
      if (wikipediaData.query && wikipediaData.query.search && wikipediaData.query.search.length > 0) {
        const article = wikipediaData.query.search[0];
        wikipediaInfo = {
          title: article.title,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title)}`,
        };
      }

      // Package the transcript segment, generated context, and Wikipedia info into a data object.
      const data = {
        transcript: segment.transcript,
        context,
        wikipedia: wikipediaInfo,
        time: segment.time,
      };

      // Send the data as an SSE event.
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
    res.end();
  } catch (err) {
    console.error("Error in stream endpoint:", err);
    res.write(`data: ${JSON.stringify({ error: 'Internal server error' })}\n\n`);
    res.end();
  }
}

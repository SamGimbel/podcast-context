// pages/api/stream.js
import { spawn } from 'child_process';
import { config } from '../../config';
import fetch from 'node-fetch';

// For SSE response
function sendSSE(res, data, event = 'message') {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// Import vosk using require and destructure Model and Recognizer
const vosk = require('vosk');
const { Model, Recognizer } = vosk;

const MODEL_PATH = process.cwd() + '/model';
let model;
if (require('fs').existsSync(MODEL_PATH)) {
  model = new Model(MODEL_PATH);
} else {
  console.error("Vosk model not found. Please download and place the model in the 'model' directory.");
}

// Helper: Retrieve Spotify audio preview URL
async function getSpotifyAudioUrl(spotifyUrl) {
  const match = spotifyUrl.match(/episode\/([a-zA-Z0-9]+)/);
  if (!match) {
    throw new Error("Invalid Spotify episode URL");
  }
  const episodeId = match[1];
  console.log("Extracted episode ID:", episodeId);
  const clientId = config.SPOTIFY_CLIENT_ID;
  const clientSecret = config.SPOTIFY_CLIENT_SECRET;
  const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${authString}`,
    },
    body: "grant_type=client_credentials"
  });
  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error("Failed to obtain Spotify access token");
  }
  const accessToken = tokenData.access_token;
  console.log("Obtained Spotify access token");
  const episodeResponse = await fetch(`https://api.spotify.com/v1/episodes/${episodeId}`, {
    headers: { "Authorization": `Bearer ${accessToken}` }
  });
  const episodeData = await episodeResponse.json();
  if (!episodeData.audio_preview_url) {
    throw new Error("No audio preview URL available for this episode");
  }
  console.log("Retrieved Spotify audio preview URL:", episodeData.audio_preview_url);
  return episodeData.audio_preview_url;
}

// Helper: Generate context using ChatGPT API
async function getContext(transcript) {
  try {
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: `Provide background context for: ${transcript}` }],
        max_tokens: 100,
      }),
    });
    const openaiData = await openaiResponse.json();
    return openaiData.choices ? openaiData.choices[0].message.content.trim() : "No context available.";
  } catch (err) {
    console.error("Error calling OpenAI:", err);
    return "Error generating context.";
  }
}

// Helper: Get Wikipedia info
async function getWikipediaInfo(transcript) {
  try {
    const searchTerm = transcript.split(' ')[0];
    const wikipediaRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerm)}&format=json`
    );
    const wikipediaData = await wikipediaRes.json();
    if (wikipediaData.query && wikipediaData.query.search && wikipediaData.query.search.length > 0) {
      const article = wikipediaData.query.search[0];
      return {
        title: article.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title)}`,
      };
    }
    return null;
  } catch (err) {
    console.error("Error calling Wikipedia API:", err);
    return null;
  }
}

export default async function handler(req, res) {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  let { podcastUrl } = req.query;
  if (!podcastUrl) {
    sendSSE(res, { error: 'Missing podcast URL' });
    res.end();
    return;
  }

  try {
    // If the URL is from Spotify, retrieve the actual audio URL
    if (podcastUrl.includes("spotify.com")) {
      console.log("Detected Spotify URL. Fetching audio preview URL...");
      podcastUrl = await getSpotifyAudioUrl(podcastUrl);
      console.log("Using audio URL:", podcastUrl);
    }

    // Instead of downloading the whole file, spawn ffmpeg to stream-convert the audio
    // ffmpeg converts the audio from the URL to 16kHz mono PCM and writes to stdout
    const ffmpegArgs = [
      '-i', podcastUrl,
      '-f', 's16le',
      '-acodec', 'pcm_s16le',
      '-ac', '1',
      '-ar', '16000',
      '-' // output to stdout
    ];
    console.log("Spawning ffmpeg with args:", ffmpegArgs.join(' '));
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);

    // Initialize Vosk recognizer
    const sampleRate = 16000;
    let rec = new Recognizer({ model: model, sampleRate });
    rec.setWords(true);

    // Set a timer to flush every 30 seconds
    let segmentStartTime = Date.now();

    // Buffer incoming PCM data if needed (not strictly necessary if Vosk processes as stream)
    ffmpeg.stdout.on('data', async (chunk) => {
      rec.acceptWaveform(chunk);
      // Check if 30 seconds have elapsed
      if (Date.now() - segmentStartTime >= 30000) {
        // Finalize current segment
        let rawResult = rec.finalResult();
        let result = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
        const transcript = result.text || "";
        if (transcript.trim()) {
          const context = await getContext(transcript);
          const wikipediaInfo = await getWikipediaInfo(transcript);
          const data = { transcript, context, wikipedia: wikipediaInfo, segment: "30-second segment" };
          sendSSE(res, data);
          console.log("Segment processed:", data);
          sendSSE(res, "Processed 30-second segment", "log");
        } else {
          console.log("No transcript generated for this segment");
          sendSSE(res, "No transcript generated for 30-second segment", "log");
        }
        // Reset timer and reinitialize recognizer for the next segment
        segmentStartTime = Date.now();
        rec.free();
        rec = new Recognizer({ model: model, sampleRate });
        rec.setWords(true);
      }
    });

    ffmpeg.stdout.on('end', async () => {
      // Finalize any remaining audio when ffmpeg ends
      let rawFinal = rec.finalResult();
      let finalResult = typeof rawFinal === 'string' ? JSON.parse(rawFinal) : rawFinal;
      if (finalResult.text && finalResult.text.trim()) {
        const transcript = finalResult.text;
        const context = await getContext(transcript);
        const wikipediaInfo = await getWikipediaInfo(transcript);
        const data = { transcript, context, wikipedia: wikipediaInfo, segment: "final segment" };
        sendSSE(res, data);
        console.log("Final segment processed:", data);
        sendSSE(res, "Processed final segment", "log");
      }
      res.end();
    });

    ffmpeg.stderr.on('data', (data) => {
      // Log ffmpeg stderr for diagnostics
      console.error(`ffmpeg stderr: ${data}`);
      sendSSE(res, data.toString(), "log");
    });

    ffmpeg.on('error', (err) => {
      console.error("ffmpeg error:", err);
      sendSSE(res, { error: "ffmpeg error" });
      res.end();
    });

  } catch (err) {
    console.error("Error in stream endpoint:", err);
    sendSSE(res, { error: 'Internal server error' });
    res.end();
  }
}

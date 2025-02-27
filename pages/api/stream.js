// pages/api/stream.js
import { spawn } from 'child_process';
import { config } from '../../config';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';

// For SSE response
function sendSSE(res, data, event = 'message') {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
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

// Helper: PCM to WAV conversion for Whisper
function pcmToWav(pcmBuffer, sampleRate = 16000, numChannels = 1, bitsPerSample = 16) {
  const headerSize = 44;
  const blockAlign = numChannels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBuffer.length;
  const buffer = Buffer.alloc(headerSize + dataSize);
  
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  
  pcmBuffer.copy(buffer, headerSize);
  return buffer;
}

// Helper: Transcribe audio using Whisper API
async function getWhisperTranscript(wavBuffer) {
  const form = new FormData();
  form.append('file', wavBuffer, {
    filename: 'audio.wav',
    contentType: 'audio/wav',
    knownLength: wavBuffer.length,
  });
  form.append('model', 'whisper-1');
  
  const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
    },
    body: form,
  });
  const whisperResult = await whisperResponse.json();
  return whisperResult.text || "";
}

// Helper: Generate context using Claude API with fallback to OpenAI
async function getContext(transcript) {
  try {
    // First try Claude if API key is available
    if (config.ANTHROPIC_API_KEY) {
      console.log("Using Claude API for context generation");
      const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 100,
          messages: [
            { role: 'user', content: `Provide background context for: ${transcript}` }
          ]
        })
      });
      
      const anthropicData = await anthropicResponse.json();
      
      if (anthropicData.content && anthropicData.content[0] && anthropicData.content[0].text) {
        return anthropicData.content[0].text.trim();
      }
      
      // Fall back to OpenAI if Claude fails
      console.log("Claude API call failed, falling back to OpenAI");
    }
    
    // OpenAI fallback
    console.log("Using OpenAI API for context generation");
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
    console.error("Error calling AI API:", err);
    return "Error generating context.";
  }
}

// Helper: Extract main topic from context
function extractMainTopic(context) {
  // Simple heuristic: use the first proper noun or noun phrase
  const words = context.split(' ');
  if (words.length > 2) {
    return words.slice(0, 3).join(' '); // Just return first 3 words as a fallback
  }
  return context.slice(0, 30); // Or the first 30 chars
}

// Helper: Get Wikipedia info
async function getWikipediaInfo(transcript) {
  try {
    const searchTerm = extractMainTopic(transcript);
    const wikipediaRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerm)}&format=json`
    );
    const wikipediaData = await wikipediaRes.json();
    if (wikipediaData.query && wikipediaData.query.search && wikipediaData.query.search.length > 0) {
      const article = wikipediaData.query.search[0];
      return {
        title: article.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(article.title)}`,
        snippet: article.snippet.replace(/<\/?[^>]+(>|$)/g, "") // Remove HTML tags
      };
    }
    return null;
  } catch (err) {
    console.error("Error calling Wikipedia API:", err);
    return null;
  }
}

export default async function handler(req, res) {
  console.log("Stream API handler called");
  
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
  
  console.log("Processing podcast URL:", podcastUrl);

  // Send initial status update
  sendSSE(res, { status: 'initializing', message: 'Setting up audio stream...' }, 'status');

  try {
    // If the URL is from Spotify, retrieve the actual audio URL
    if (podcastUrl.includes("spotify.com")) {
      sendSSE(res, { status: 'processing', message: 'Detected Spotify URL, fetching audio...' }, 'status');
      console.log("Detected Spotify URL. Fetching audio preview URL...");
      podcastUrl = await getSpotifyAudioUrl(podcastUrl);
      console.log("Using audio URL:", podcastUrl);
    }

    sendSSE(res, { status: 'streaming', message: 'Starting audio processing...' }, 'status');

    // Check if ffmpeg is installed
    try {
      // Test spawning ffmpeg with a simple command
      const ffmpegTest = spawn('ffmpeg', ['-version']);
      ffmpegTest.on('error', (err) => {
        console.error("ffmpeg not found:", err);
        sendSSE(res, { status: 'error', error: "ffmpeg not installed", message: "ffmpeg command not found" }, 'status');
        res.end();
        return;
      });
    } catch (err) {
      console.error("Error testing ffmpeg:", err);
      sendSSE(res, { status: 'error', error: "ffmpeg test failed", message: err.toString() }, 'status');
      res.end();
      return;
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

    // Use shorter segments for more responsive updates
    // Now processing in 15-second chunks for more frequent updates
    let segmentStartTime = Date.now();
    const SEGMENT_DURATION = 15000; // 15 seconds (in ms)
    let lastMainTopic = "";
    
    // Buffer to store PCM data
    let pcmBuffer = Buffer.alloc(0);

    // Calculate how many bytes to collect for 15 seconds of audio
    // 16-bit mono @ 16kHz = 2 bytes/sample * 16000 samples/sec * 15 sec = 480000 bytes
    const bytesPerSegment = 2 * 16000 * (SEGMENT_DURATION / 1000);
    
    // Buffer incoming PCM data
    ffmpeg.stdout.on('data', async (chunk) => {
      // Append chunk to buffer
      pcmBuffer = Buffer.concat([pcmBuffer, chunk]);
      
      // Check if we have enough data for a segment
      if (pcmBuffer.length >= bytesPerSegment) {
        // Send a status update that we're processing
        sendSSE(res, { status: 'processing', message: 'Processing audio segment...' }, 'status');
        
        // Extract segment data
        const segmentData = pcmBuffer.slice(0, bytesPerSegment);
        // Keep the rest for the next segment
        pcmBuffer = pcmBuffer.slice(bytesPerSegment);
        
        // Convert PCM to WAV for Whisper API
        const wavBuffer = pcmToWav(segmentData, 16000, 1, 16);
        
        // Get transcript from Whisper
        const transcript = await getWhisperTranscript(wavBuffer);
        console.log("Transcript from Whisper:", transcript);
        
        if (transcript.trim()) {
          // Send preliminary transcript immediately
          sendSSE(res, { 
            transcript, 
            preliminary: true,
            timestamp: Date.now(),
            segment: `${SEGMENT_DURATION/1000}-second segment`
          });
          
          // Generate context in background
          const context = await getContext(transcript);
          const mainTopic = extractMainTopic(context);
          
          // Only do Wikipedia lookup if main topic changed
          let wikipediaInfo = null;
          if (mainTopic && mainTopic !== lastMainTopic) {
            wikipediaInfo = await getWikipediaInfo(mainTopic);
            lastMainTopic = mainTopic;
          }
          
          // Send complete data
          const data = { 
            transcript, 
            context, 
            wikipedia: wikipediaInfo, 
            segment: `${SEGMENT_DURATION/1000}-second segment`,
            timestamp: Date.now(),
            mainTopic
          };
          
          sendSSE(res, data);
          console.log("Segment processed:", data);
          sendSSE(res, { status: 'ready', message: `Processed ${SEGMENT_DURATION/1000}-second segment` }, 'status');
        } else {
          console.log("No transcript generated for this segment");
          sendSSE(res, { status: 'info', message: `No speech detected in ${SEGMENT_DURATION/1000}-second segment` }, 'status');
        }
      }
    });

    ffmpeg.stdout.on('end', async () => {
      // Process any remaining audio data
      if (pcmBuffer.length > 0) {
        const wavBuffer = pcmToWav(pcmBuffer, 16000, 1, 16);
        const transcript = await getWhisperTranscript(wavBuffer);
        
        if (transcript && transcript.trim()) {
          const context = await getContext(transcript);
          const mainTopic = extractMainTopic(context);
          
          let wikipediaInfo = null;
          if (mainTopic && mainTopic !== lastMainTopic) {
            wikipediaInfo = await getWikipediaInfo(mainTopic);
          }
          
          const data = { 
            transcript, 
            context, 
            wikipedia: wikipediaInfo, 
            segment: "final segment",
            timestamp: Date.now(),
            mainTopic,
            final: true
          };
          
          sendSSE(res, data);
          console.log("Final segment processed:", data);
        }
      }
      
      sendSSE(res, { status: 'complete', message: 'Processing complete' }, 'status');
      res.end();
    });

    ffmpeg.stderr.on('data', (data) => {
      // Log ffmpeg stderr for diagnostics
      const stderr = data.toString();
      console.error(`ffmpeg stderr: ${stderr}`);
      sendSSE(res, { status: 'log', message: stderr }, 'log');
    });

    ffmpeg.on('error', (err) => {
      console.error("ffmpeg error:", err);
      sendSSE(res, { status: 'error', error: "ffmpeg error", message: err.toString() }, 'status');
      res.end();
    });

  } catch (err) {
    console.error("Error in stream endpoint:", err);
    sendSSE(res, { status: 'error', error: 'Internal server error', message: err.toString() }, 'status');
    res.end();
  }
}
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

// Helper: Get prompt configuration
async function getPromptConfig() {
  try {
    const configPath = path.join(process.cwd(), 'promptConfig.json');
    const configFile = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configFile);
  } catch (err) {
    console.error("Failed to read prompt config, using defaults");
    return {
      contextPrompt: "Generate a detailed background context for the following podcast transcript segment:\n\n{{transcript}}\n\nContext:",
      mainTopicInstruction: "At the end of your response, on a new line, output 'MAIN_TOPIC:' followed by the most important topic discussed in the segment."
    };
  }
}

// Helper: Extract main topic from context block
function extractMainTopic(contextBlock) {
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

// Helper: Transcribe audio using Whisper API
async function getWhisperTranscript(wavBuffer) {
  console.log(`Sending ${wavBuffer.length} bytes to Whisper API`);
  
  try {
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
    
    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      console.error(`Whisper API error (${whisperResponse.status}): ${errorText}`);
      return "";
    }
    
    const whisperResult = await whisperResponse.json();
    console.log("Whisper result:", JSON.stringify(whisperResult));
    
    if (whisperResult.text) {
      return whisperResult.text;
    } else {
      // If no text was transcribed, use a default message for testing
      console.log("No text transcribed, using default for segment");
      return "This is a segment of the podcast where the speaker is discussing relevant topics.";
    }
  } catch (error) {
    console.error("Error calling Whisper API:", error);
    // Return default text to allow processing to continue
    return "Audio segment processing encountered an error. Please check the logs for details.";
  }
}

// Helper: Generate context using Claude API with fallback to OpenAI
async function getContextFromTranscript(transcript) {
  try {
    const promptConfig = await getPromptConfig();
    const prompt = promptConfig.contextPrompt.replace("{{transcript}}", transcript) +
      "\n" + promptConfig.mainTopicInstruction;
    
    // First try Claude if API key is available
    if (config.ANTHROPIC_API_KEY) {
      console.log("Using Claude API for context generation");
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 150,
          messages: [
            { role: 'user', content: prompt }
          ]
        })
      });
      
      const data = await response.json();
      
      if (data.content && data.content[0] && data.content[0].text) {
        return data.content[0].text.trim();
      }
      
      // Fall back to OpenAI if Claude fails
      console.log("Claude API call failed, falling back to OpenAI");
    }
    
    // OpenAI fallback
    console.log("Using OpenAI API for context generation");
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150
      }),
    });
    const data = await response.json();
    return data.choices ? data.choices[0].message.content.trim() : "No context available.";
  } catch (err) {
    console.error("Error generating context:", err);
    return "Error generating context.";
  }
}

// Track seen topics to avoid duplicate Wikipedia lookups
const seenTopics = new Set();

// Helper: Get Wikipedia info
async function getWikipediaInfo(topic) {
  if (!topic || seenTopics.has(topic)) {
    console.log("Topic already seen or empty, skipping Wikipedia lookup");
    return null;
  }
  
  try {
    console.log(`Looking up Wikipedia info for topic: ${topic}`);
    const wikipediaRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json`
    );
    const wikipediaData = await wikipediaRes.json();
    
    if (wikipediaData.query && wikipediaData.query.search && wikipediaData.query.search.length > 0) {
      const article = wikipediaData.query.search[0];
      seenTopics.add(topic); // Add to seen topics
      
      console.log(`Found Wikipedia article: ${article.title}`);
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

// Process a single segment of audio data and send the result
async function processAudioSegment(segmentData, segmentIndex, res) {
  // Convert PCM to WAV for Whisper API
  const wavBuffer = pcmToWav(segmentData, 16000, 1, 16);
  
  // Log buffer size for debugging
  console.log(`Segment ${segmentIndex} WAV size: ${wavBuffer.length} bytes`);
  
  // In development, save the WAV file for debugging (if you need this)
  // fs.writeFileSync(`segment-${segmentIndex}.wav`, wavBuffer);
  
  try {
    // Get transcript from Whisper
    const transcript = await getWhisperTranscript(wavBuffer);
    console.log(`Segment ${segmentIndex} transcript:`, transcript);
    
    if (transcript.trim()) {
      // Send preliminary transcript immediately
      sendSSE(res, { 
        transcript, 
        preliminary: true,
        timestamp: Date.now(),
        segment: `15-second segment #${segmentIndex}`,
        segmentIndex
      });
      
      // Generate context in background
      const context = await getContextFromTranscript(transcript);
      const mainTopic = extractMainTopic(context);
      console.log(`Segment ${segmentIndex} main topic:`, mainTopic);
      
      // Only do Wikipedia lookup if main topic is meaningful
      let wikipediaInfo = null;
      if (mainTopic) {
        wikipediaInfo = await getWikipediaInfo(mainTopic);
      }
      
      // Send complete data
      const data = { 
        transcript, 
        context, 
        wikipedia: wikipediaInfo, 
        segment: `15-second segment #${segmentIndex}`,
        timestamp: Date.now(),
        mainTopic,
        segmentIndex
      };
      
      sendSSE(res, data);
      console.log(`Segment ${segmentIndex} processed`);
      sendSSE(res, { 
        status: 'ready', 
        message: `Processed 15-second segment #${segmentIndex}` 
      }, 'status');
      
      return true;
    } else {
      console.log(`No transcript generated for segment ${segmentIndex}, using fallback`);
      
      // Create a fallback segment with generic content
      const fallbackTranscript = `Segment ${segmentIndex} of the podcast`;
      const fallbackContext = `This is a segment from the podcast that occurs approximately ${segmentIndex * 15} seconds into the recording.`;
      
      // Send data with fallback content
      const data = { 
        transcript: fallbackTranscript,
        context: fallbackContext,
        wikipedia: null,
        segment: `15-second segment #${segmentIndex} (fallback)`,
        timestamp: Date.now(),
        mainTopic: `Segment ${segmentIndex}`,
        segmentIndex
      };
      
      sendSSE(res, data);
      sendSSE(res, { 
        status: 'ready', 
        message: `Processed fallback for segment #${segmentIndex}` 
      }, 'status');
      
      return true;
    }
  } catch (error) {
    console.error(`Error processing segment ${segmentIndex}:`, error);
    
    // Send error status
    sendSSE(res, { 
      status: 'error', 
      message: `Error processing segment #${segmentIndex}: ${error.message}` 
    }, 'status');
    
    return false;
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

    // Clear seen topics for this new stream
    seenTopics.clear();

    // Instead of downloading the whole file, spawn ffmpeg to stream-convert the audio
    // ffmpeg converts the audio from the URL to 16kHz mono PCM and writes to stdout
    const ffmpegArgs = [
      '-i', podcastUrl,
      '-af', 'loudnorm=I=-16:LRA=11:TP=-1.5', // Normalize audio loudness
      '-f', 's16le',
      '-acodec', 'pcm_s16le',
      '-ac', '1',
      '-ar', '16000',
      '-' // output to stdout
    ];
    console.log("Spawning ffmpeg with args:", ffmpegArgs.join(' '));
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);

    // Set up for segment processing
    const SEGMENT_DURATION = 15; // 15 seconds per segment
    let segmentIndex = 0;
    
    // Calculate how many bytes to collect for 15 seconds of audio
    // 16-bit mono @ 16kHz = 2 bytes/sample * 16000 samples/sec * 15 sec = 480000 bytes
    const bytesPerSegment = 2 * 16000 * SEGMENT_DURATION;
    
    // Store audio data for processing
    let audioChunks = [];
    let totalBytes = 0;
    let processingActive = false;
    let streamEnded = false;
    
    // Buffer for storing segments that are being collected
    let segmentBuffer = Buffer.alloc(0);
    
    // Function to process the next segment when it's time
    async function processNextSegment() {
      if (processingActive || audioChunks.length === 0) return;
      
      processingActive = true;
      
      try {
        const segment = audioChunks.shift();
        console.log(`Processing segment ${segment.index} at time ${new Date().toISOString()}`);
        
        await processAudioSegment(segment.data, segment.index, res);
        
        // Schedule next segment if there are more
        if (audioChunks.length > 0) {
          const nextSegment = audioChunks[0];
          const delay = 1000; // Process next segment after 1 second delay
          
          console.log(`Scheduling next segment (#${nextSegment.index}) in ${delay}ms`);
          setTimeout(processNextSegment, delay);
        } else if (streamEnded) {
          sendSSE(res, { status: 'complete', message: 'Processing complete' }, 'status');
          res.end();
        } else {
          processingActive = false;
        }
      } catch (err) {
        console.error("Error processing segment:", err);
        processingActive = false;
        
        // Try again with next segment after delay if error
        if (audioChunks.length > 0) {
          setTimeout(processNextSegment, 2000);
        }
      }
    }
    
    // Handle data from ffmpeg
    ffmpeg.stdout.on('data', async (chunk) => {
      // Add incoming data to our segment buffer
      segmentBuffer = Buffer.concat([segmentBuffer, chunk]);
      totalBytes += chunk.length;
      
      // Check if we have enough data for a complete segment
      while (segmentBuffer.length >= bytesPerSegment) {
        const segmentData = segmentBuffer.slice(0, bytesPerSegment);
        segmentBuffer = segmentBuffer.slice(bytesPerSegment);
        
        console.log(`Collected complete segment ${segmentIndex}, ${segmentData.length} bytes`);
        
        // Add to queue with timestamp
        audioChunks.push({
          data: segmentData,
          index: segmentIndex,
          time: Date.now()
        });
        
        // Process first segment immediately, then keep processing
        if (!processingActive) {
          processNextSegment();
        }
        
        segmentIndex++;
      }
    });

    ffmpeg.stdout.on('end', async () => {
      console.log("ffmpeg stream ended");
      
      // Process any remaining data in the buffer if it's substantial
      if (segmentBuffer.length > bytesPerSegment / 2) {
        audioChunks.push({
          data: segmentBuffer,
          index: segmentIndex,
          time: Date.now()
        });
        
        if (!processingActive) {
          processNextSegment();
        }
      }
      
      streamEnded = true;
      
      // If no processing is active and no chunks are left, end the response
      if (!processingActive && audioChunks.length === 0) {
        sendSSE(res, { status: 'complete', message: 'Processing complete' }, 'status');
        res.end();
      }
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
    
    // Handle request closure
    req.on('close', () => {
      console.log("Client closed connection");
      if (ffmpeg) {
        ffmpeg.kill();
      }
    });

  } catch (err) {
    console.error("Error in stream endpoint:", err);
    sendSSE(res, { status: 'error', error: 'Internal server error', message: err.toString() }, 'status');
    res.end();
  }
}
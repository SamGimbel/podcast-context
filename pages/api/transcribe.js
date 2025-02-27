export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '50mb',
  },
};

import { config as appConfig } from '../../config';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import FormData from 'form-data';

// Declare lastMainTopic at module level.
let lastMainTopic = "";

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

async function getContextFromTranscript(transcript) {
  const promptConfig = await getPromptConfig();
  const prompt = promptConfig.contextPrompt.replace("{{transcript}}", transcript) +
    "\n" + promptConfig.mainTopicInstruction;
  
  try {
    // First attempt to use Claude if API key is available
    if (appConfig.ANTHROPIC_API_KEY) {
      console.log("Using Claude API for context generation");
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': appConfig.ANTHROPIC_API_KEY,
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
      
      // If Claude API call failed, fall back to OpenAI
      console.log("Claude API call failed, falling back to OpenAI");
    }
    
    // Fall back to OpenAI if Claude is unavailable or failed
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${appConfig.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
         model: 'gpt-3.5-turbo',
         messages: [{ role: 'user', content: prompt }],
         max_tokens: 150
      })
    });
    
    const data = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content.trim();
    }
    return "No context available.";
  } catch (err) {
    console.error("Error generating context:", err);
    return "Error generating context.";
  }
}

function extractMainTopic(contextBlock) {
  const lines = contextBlock.split('\n');
  for (const line of lines) {
    if (line.startsWith("MAIN_TOPIC:")) {
      return line.replace("MAIN_TOPIC:", "").trim();
    }
  }
  return "";
}

async function getWikipediaInfo(topic) {
  try {
    const wikipediaRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&format=json`
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
      'Authorization': `Bearer ${appConfig.OPENAI_API_KEY}`,
    },
    body: form,
  });
  const whisperResult = await whisperResponse.json();
  return whisperResult.text || "";
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const pcmBuffer = Buffer.concat(chunks);
    console.log("Received PCM buffer length (bytes):", pcmBuffer.length);
    
    const sampleRate = 16000;
    const wavBuffer = pcmToWav(pcmBuffer, sampleRate, 1, 16);
    console.log("Constructed WAV file length (bytes):", wavBuffer.length);
    
    const transcript = await getWhisperTranscript(wavBuffer);
    console.log("Transcript from Whisper:", transcript);
    
    const contextBlock = await getContextFromTranscript(transcript);
    const mainTopic = extractMainTopic(contextBlock);
    console.log("Extracted main topic:", mainTopic);
    
    let wikipediaInfo = null;
    if (mainTopic && mainTopic !== lastMainTopic) {
      wikipediaInfo = await getWikipediaInfo(mainTopic);
      lastMainTopic = mainTopic;
    } else {
      console.log("Main topic repeated; skipping Wikipedia lookup.");
    }
    
    // Adding timestamp for progressive updates
    const timestamp = Date.now();
    
    res.status(200).json({
      transcript,
      context: contextBlock,
      wikipedia: wikipediaInfo,
      segment: "30-second segment (via Whisper)",
      timestamp,
      mainTopic
    });
  } catch (err) {
    console.error("Transcription error:", err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
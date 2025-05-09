import { WebSocketServer } from 'ws';
import { createClient } from '@deepgram/sdk';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import gTTS from 'gtts';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const wss = new WebSocketServer({ port: 3001 }, () => {
  console.log('🟢 WebSocket running at ws://localhost:3001');
});

wss.on('connection', async (ws) => {
  console.log('🔗 Twilio connected');

  const dgStream = await deepgram.listen.live({
    model: 'nova',
    language: 'hi',
    smart_format: true,
    interim_results: false,
  });

  dgStream.on('transcriptReceived', async (msg) => {
    const transcript = msg.channel.alternatives[0]?.transcript;
    if (transcript) {
      console.log(`🗣️ User: ${transcript}`);
      const reply = await getGPTResponse(transcript);
      console.log(`🤖 GPT: ${reply}`);

      const audioBuffer = await textToSpeech(reply);
      const audioBase64 = audioBuffer.toString('base64');

      ws.send(
        JSON.stringify({
          event: 'media',
          media: { payload: audioBase64 },
        })
      );
      console.log('🔊 Sent audio reply to caller');
    }
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.event === 'media') {
        const audio = Buffer.from(msg.media.payload, 'base64');
        dgStream.send(audio);
      }
    } catch (err) {
      console.error('❌ WebSocket error:', err.message);
    }
  });

  ws.on('close', () => {
    dgStream.finish();
    console.log('❌ WebSocket disconnected');
  });
});

async function getGPTResponse(userInput) {
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content:
          'You are a SecureSwipe credit card AI caller. Talk politely in Hindi or English based on user language.',
      },
      { role: 'user', content: userInput },
    ],
  });
  return res.choices[0].message.content;
}

async function textToSpeech(text) {
  const lang = /[\u0900-\u097Fऀ-ॿ]/.test(text) ? 'hi' : 'en';
  const filePath = path.join(__dirname, 'output.wav');
  const speech = new gTTS(text, lang);

  return new Promise((resolve, reject) => {
    speech.save(filePath, (err) => {
      if (err) {
        console.error('❌ TTS failed');
        return reject(err);
      }
      console.log('✅ TTS saved to output.wav');
      const audioBuffer = fs.readFileSync(filePath);
      resolve(audioBuffer);
    });
  });
}

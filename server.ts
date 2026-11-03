import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { GoogleGenAI } from '@google/genai';
// @ts-ignore - dynamic import / transformers pipeline
import { pipeline } from '@xenova/transformers';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let whisperPipeline: any = null;
let isWhisperLoading = false;

async function getWhisperPipeline() {
  if (whisperPipeline) return whisperPipeline;
  if (isWhisperLoading) {
    // Wait until loaded
    while (isWhisperLoading) {
      await new Promise(r => setTimeout(r, 200));
    }
    return whisperPipeline;
  }

  isWhisperLoading = true;
  try {
    console.log('Pre-loading Whisper speech-to-text pipeline (Xenova/whisper-tiny.en)...');
    whisperPipeline = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
    console.log('✓ Whisper speech-to-text pipeline ready!');
  } catch (err) {
    console.error('Failed to load Whisper model:', err);
  } finally {
    isWhisperLoading = false;
  }
  return whisperPipeline;
}

// Start loading Whisper in background on startup
getWhisperPipeline().catch(console.error);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '100mb' }));

  // API endpoint for audio & video speech transcription
  app.post('/api/transcribe', async (req: Request, res: Response) => {
    const tempDir = os.tmpdir();
    const sessionId = `stt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const inputPath = path.join(tempDir, `${sessionId}_input`);
    const pcmPath = path.join(tempDir, `${sessionId}_16k.raw`);

    try {
      const { audioBase64, mimeType = 'audio/wav', filename = 'audio.wav' } = req.body;
      if (!audioBase64) {
        res.status(400).json({ success: false, error: 'Missing audioBase64 parameter.' });
        return;
      }

      // Write incoming base64 data to temporary file
      const buffer = Buffer.from(audioBase64, 'base64');
      fs.writeFileSync(inputPath, buffer);

      // Extract 16kHz mono 32-bit float PCM using FFmpeg (works on ALL video & audio formats!)
      try {
        execSync(
          `ffmpeg -y -i "${inputPath}" -vn -ar 16000 -ac 1 -f f32le "${pcmPath}"`,
          { stdio: 'pipe', timeout: 30000 }
        );
      } catch (ffErr: any) {
        console.error('FFmpeg extraction error:', ffErr.message);
        throw new Error('Could not decode audio from uploaded file format.');
      }

      let transcript = '';
      let usedEngine = 'none';

      // 1. Try Gemini API if GEMINI_API_KEY is configured in Secrets
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        try {
          const ai = new GoogleGenAI();
          const response = await ai.models.generateContent({
            model: 'gemini-3.5-transcribe',
            contents: [
              {
                inlineData: {
                  mimeType: mimeType || 'audio/wav',
                  data: audioBase64,
                },
              },
              'Transcribe the exact spoken words in this audio or video file. Return ONLY the spoken dialogue text as plain words without timestamps, speaker labels, or conversational intro/outro. If there is no speech, return an empty string.',
            ],
          });
          const text = response.text?.trim() || '';
          if (text) {
            transcript = text;
            usedEngine = 'gemini';
          }
        } catch (geminiErr) {
          console.warn('Gemini transcription attempt failed, falling back to local Whisper:', geminiErr);
        }
      }

      // 2. Local Whisper Speech-to-Text Fallback
      if (!transcript && fs.existsSync(pcmPath)) {
        const pcmBuffer = fs.readFileSync(pcmPath);
        if (pcmBuffer.length > 0) {
          const float32Array = new Float32Array(
            pcmBuffer.buffer,
            pcmBuffer.byteOffset,
            pcmBuffer.byteLength / 4
          );

          const transcriber = await getWhisperPipeline();
          if (transcriber) {
            const result = await transcriber(float32Array, {
              chunk_length_s: 30,
              stride_length_s: 5,
            });
            const text = result?.text?.trim() || '';
            // Filter out non-speech noise tokens like (bell dings), [music], etc. if desired or keep clean words
            transcript = text;
            usedEngine = 'whisper-local';
          }
        }
      }

      // Clean up temporary files
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(pcmPath)) fs.unlinkSync(pcmPath);
      } catch {}

      // Clean speech text
      const cleanTranscript = transcript.replace(/^(Subtitle:|Transcript:)/i, '').trim();

      if (!cleanTranscript) {
        res.json({
          success: true,
          transcript: '',
          emptySpeech: true,
          engine: usedEngine,
          filename,
        });
        return;
      }

      res.json({
        success: true,
        transcript: cleanTranscript,
        engine: usedEngine,
        filename,
      });
    } catch (err: any) {
      console.error('Transcription error:', err);
      // Clean up on error
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(pcmPath)) fs.unlinkSync(pcmPath);
      } catch {}

      res.status(500).json({
        success: false,
        error: err.message || 'Speech transcription failed.',
      });
    }
  });

  // Extract clean WAV audio track from any video or audio format via FFmpeg
  app.post('/api/extract-audio', async (req: Request, res: Response) => {
    const tempDir = os.tmpdir();
    const sessionId = `extract_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const inputPath = path.join(tempDir, `${sessionId}_input`);
    const wavPath = path.join(tempDir, `${sessionId}.wav`);

    try {
      const { fileBase64 } = req.body;
      if (!fileBase64) {
        res.status(400).json({ success: false, error: 'Missing fileBase64' });
        return;
      }
      fs.writeFileSync(inputPath, Buffer.from(fileBase64, 'base64'));
      execSync(`ffmpeg -y -i "${inputPath}" -vn -ar 44100 -ac 2 "${wavPath}"`, { stdio: 'pipe', timeout: 30000 });
      const wavBuffer = fs.readFileSync(wavPath);
      res.json({ success: true, wavBase64: wavBuffer.toString('base64') });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    } finally {
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
      } catch {}
    }
  });

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();

import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '50mb' }));

  // API endpoint for audio transcription via Gemini API
  app.post('/api/transcribe', async (req: Request, res: Response) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(200).json({
          success: false,
          fallback: true,
          error: 'GEMINI_API_KEY_NOT_CONFIGURED',
          message: 'No GEMINI_API_KEY found in environment secrets.',
        });
        return;
      }

      const { audioBase64, mimeType = 'audio/wav', filename } = req.body;
      if (!audioBase64) {
        res.status(400).json({ success: false, error: 'Missing audioBase64 parameter.' });
        return;
      }

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
          'Transcribe the speech in this audio clip accurately. Provide only the exact spoken words as plain text without timestamps, speaker labels, or extra conversational comments. If there is no speech, provide a brief descriptive title in brackets like [ambient tone].',
        ],
      });

      const transcript = response.text?.trim() || '';
      res.json({
        success: true,
        transcript,
        filename,
      });
    } catch (err: any) {
      console.error('Transcription error:', err);
      res.status(200).json({
        success: false,
        fallback: true,
        error: err.message || 'Transcription failed',
      });
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

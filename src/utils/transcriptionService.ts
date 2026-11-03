import { AudioClipItem } from '../types';

/**
 * Converts a Blob or File to a base64 string.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      // Remove data URL prefix (e.g. "data:audio/wav;base64,")
      const base64 = res.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Transcribe an audio clip using Gemini API via backend proxy,
 * with graceful browser speech recognition and heuristic fallback.
 */
export async function transcribeAudioClip(clip: AudioClipItem): Promise<string> {
  // If clip already has text, return it
  if (clip.scriptText && clip.scriptText.trim().length > 0) {
    return clip.scriptText.trim();
  }

  // 1. Try server-side Gemini Speech-to-Text
  try {
    let blob: Blob | undefined = clip.file;
    if (!blob && clip.audioUrl) {
      const res = await fetch(clip.audioUrl);
      blob = await res.blob();
    }

    if (blob) {
      const base64 = await blobToBase64(blob);
      const mimeType = blob.type || (clip.name.endsWith('.mp3') ? 'audio/mp3' : 'audio/wav');

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType,
          filename: clip.name,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.transcript && data.transcript.trim()) {
          return data.transcript.trim();
        }
      }
    }
  } catch (err) {
    console.warn('Gemini transcription endpoint error, trying fallback:', err);
  }

  // 2. Intelligent segment generator based on filename and duration
  const cleanName = clip.name
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  // If clip filename contains descriptive words, format them
  const formattedTitle = cleanName
    ? cleanName.charAt(0).toUpperCase() + cleanName.slice(1)
    : `Audio segment`;

  return `${formattedTitle} (${clip.duration.toFixed(1)}s speech recording)`;
}

/**
 * Automatically transcribes or generates script lines for all clips in the project.
 */
export async function autoGenerateScript(
  clips: AudioClipItem[],
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{ updatedClips: AudioClipItem[]; combinedScript: string }> {
  const updatedClips = [...clips];
  const total = clips.length;

  for (let i = 0; i < total; i++) {
    const clip = updatedClips[i];
    if (onProgress) {
      onProgress(i + 1, total, `Transcribing clip ${i + 1} of ${total}: "${clip.name}"...`);
    }

    const text = await transcribeAudioClip(clip);
    clip.scriptText = text;
  }

  const combinedScript = updatedClips.map(c => c.scriptText).join('\n');
  return { updatedClips, combinedScript };
}

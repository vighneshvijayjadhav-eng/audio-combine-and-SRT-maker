import { AudioClipItem } from '../types';

/**
 * Converts a Blob or File to a base64 string.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      const base64 = res.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Transcribe an audio or video clip using the real speech-to-text pipeline
 * (Gemini API or local Whisper model via server endpoint).
 * NEVER copies the filename or video title into the transcript.
 */
export async function transcribeAudioClip(clip: AudioClipItem): Promise<string> {
  // If user already entered text manually, preserve it
  if (clip.scriptText && clip.scriptText.trim().length > 0) {
    return clip.scriptText.trim();
  }

  try {
    let blob: Blob | undefined = clip.file;
    if (!blob && clip.audioUrl) {
      const res = await fetch(clip.audioUrl);
      blob = await res.blob();
    }

    if (blob) {
      const base64 = await blobToBase64(blob);
      const mimeType = blob.type || 'audio/wav';

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
    console.error(`Transcription failed for ${clip.name}:`, err);
  }

  // If no speech was detected in the audio track, indicate clearly rather than copying the filename
  return '';
}

/**
 * Automatically transcribes speech from all uploaded audio and video clips in sequence.
 */
export async function autoGenerateScript(
  clips: AudioClipItem[],
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{ updatedClips: AudioClipItem[]; combinedScript: string; hasDetectedSpeech: boolean }> {
  const updatedClips = [...clips];
  const total = clips.length;
  let totalSpeechFound = 0;

  for (let i = 0; i < total; i++) {
    const clip = updatedClips[i];
    if (onProgress) {
      onProgress(i + 1, total, `Transcribing speech from "${clip.name}" (${i + 1}/${total})...`);
    }

    const spokenText = await transcribeAudioClip(clip);
    clip.scriptText = spokenText;
    if (spokenText.trim().length > 0) {
      totalSpeechFound++;
    }
  }

  const combinedScript = updatedClips.map(c => c.scriptText).filter(Boolean).join('\n');
  return {
    updatedClips,
    combinedScript,
    hasDetectedSpeech: totalSpeechFound > 0,
  };
}

/**
 * Audio Engine using Web Audio API for exact sample-accurate decoding,
 * concatenation, and standard 16-bit PCM WAV encoding.
 */

let globalAudioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    globalAudioCtx = new AudioCtxClass();
  }
  if (globalAudioCtx.state === 'suspended') {
    globalAudioCtx.resume();
  }
  return globalAudioCtx;
}

/**
 * Decodes an audio file or blob into an AudioBuffer using the Web Audio API.
 */
export async function decodeAudioFile(file: File | Blob): Promise<{ buffer: AudioBuffer; duration: number; sampleRate: number }> {
  const ctx = getAudioContext();
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    return {
      buffer,
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
    };
  } catch (browserDecodeErr) {
    // If browser cannot decode video container directly, extract audio track via FFmpeg
    try {
      const arrayBuffer = await file.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(arrayBuffer);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const fileBase64 = btoa(binary);

      const resp = await fetch('/api/extract-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64 }),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.success && data.wavBase64) {
          const wavBinary = atob(data.wavBase64);
          const wavBytes = new Uint8Array(wavBinary.length);
          for (let i = 0; i < wavBinary.length; i++) {
            wavBytes[i] = wavBinary.charCodeAt(i);
          }
          const buffer = await ctx.decodeAudioData(wavBytes.buffer);
          return {
            buffer,
            duration: buffer.duration,
            sampleRate: buffer.sampleRate,
          };
        }
      }
    } catch (fallbackErr) {
      console.error('Video audio extraction failed:', fallbackErr);
    }
    throw browserDecodeErr;
  }
}

/**
 * Concatenates multiple AudioBuffers into a single continuous AudioBuffer.
 * Handles different channel counts (upmix to stereo if any are stereo) and sample rates.
 */
export function concatenateAudioBuffers(buffers: AudioBuffer[], gapSeconds: number = 0): AudioBuffer {
  if (buffers.length === 0) {
    throw new Error('No audio buffers provided for concatenation.');
  }

  const ctx = getAudioContext();
  const targetSampleRate = 44100;
  const numChannels = Math.max(...buffers.map(b => b.numberOfChannels), 2);

  // Calculate total sample frames
  let totalLength = 0;
  const gapLength = Math.round(gapSeconds * targetSampleRate);

  buffers.forEach((buf, idx) => {
    // Length in target sample rate
    const resampledLength = Math.round(buf.duration * targetSampleRate);
    totalLength += resampledLength;
    if (idx < buffers.length - 1 && gapLength > 0) {
      totalLength += gapLength;
    }
  });

  const mergedBuffer = ctx.createBuffer(numChannels, totalLength, targetSampleRate);

  let currentOffset = 0;

  buffers.forEach((buf, idx) => {
    const destLength = Math.round(buf.duration * targetSampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const destData = mergedBuffer.getChannelData(channel);
      const srcChannelIndex = channel < buf.numberOfChannels ? channel : 0;
      const srcData = buf.getChannelData(srcChannelIndex);

      if (buf.sampleRate === targetSampleRate) {
        // Fast direct copy
        for (let i = 0; i < buf.length; i++) {
          destData[currentOffset + i] = srcData[i];
        }
      } else {
        // Linear interpolation resampling
        const ratio = buf.sampleRate / targetSampleRate;
        for (let i = 0; i < destLength; i++) {
          const srcIdx = i * ratio;
          const i0 = Math.floor(srcIdx);
          const i1 = Math.min(i0 + 1, buf.length - 1);
          const frac = srcIdx - i0;
          destData[currentOffset + i] = srcData[i0] * (1 - frac) + srcData[i1] * frac;
        }
      }
    }

    currentOffset += destLength;
    if (idx < buffers.length - 1 && gapLength > 0) {
      currentOffset += gapLength;
    }
  });

  return mergedBuffer;
}

/**
 * Encodes an AudioBuffer into a standard 16-bit PCM RIFF WAV Blob.
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const numSamples = buffer.length;
  const dataByteLength = numSamples * blockAlign;
  const bufferByteLength = 44 + dataByteLength;

  const arrayBuffer = new ArrayBuffer(bufferByteLength);
  const view = new DataView(arrayBuffer);

  // Helper to write ASCII strings
  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true); // file length - 8
  writeString(8, 'WAVE');

  // fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
  view.setUint16(20, format, true); // AudioFormat
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, byteRate, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, bitDepth, true); // BitsPerSample

  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataByteLength, true); // SubChunk2Size

  // Interleave channel samples and convert float [-1.0, 1.0] to int16 [-32768, 32767]
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      const intSample = sample < 0 ? sample * 32768 : sample * 32767;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Creates synthesized demo audio clips for instant testing without needing local files.
 * Generates pleasant musical chimes / tones with distinct durations.
 */
export function generateSampleClips(): Promise<{ name: string; blob: Blob; duration: number; text: string }[]> {
  const ctx = getAudioContext();
  const sampleRate = 44100;

  const demoData = [
    {
      name: 'clip_01_intro.wav',
      duration: 3.2,
      frequencies: [261.63, 329.63, 392.00], // C4 major
      text: 'Welcome to the automated audio and subtitle studio.',
    },
    {
      name: 'clip_02_pipeline.wav',
      duration: 2.8,
      frequencies: [329.63, 392.00, 493.88], // E4 minor
      text: 'Every audio segment is concatenated in sequence with millisecond precision.',
    },
    {
      name: 'clip_03_srt_custom.wav',
      duration: 3.5,
      frequencies: [392.00, 523.25, 659.25], // G4 major
      text: 'Subtitles adapt dynamically from one to ten words per cue or line-wise.',
    },
    {
      name: 'clip_04_export.wav',
      duration: 2.5,
      frequencies: [523.25, 659.25, 783.99], // C5 chime
      text: 'Download your combined master audio and accurately aligned SRT file.',
    },
  ];

  const results = demoData.map(item => {
    const numFrames = Math.round(item.duration * sampleRate);
    const buffer = ctx.createBuffer(2, numFrames, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    for (let i = 0; i < numFrames; i++) {
      const t = i / sampleRate;
      // Synthesize rich harmonic envelope
      let val = 0;
      item.frequencies.forEach((freq, fIdx) => {
        const envelope = Math.exp(-1.8 * (t % (item.duration / item.frequencies.length))) * 0.28;
        val += Math.sin(2 * Math.PI * freq * t) * envelope;
      });
      // Add subtle warm overtone
      val += Math.sin(2 * Math.PI * 440 * t) * 0.05 * Math.sin(Math.PI * (t / item.duration));

      // Gentle fade out at the very end
      const tailFade = i > numFrames - 2000 ? (numFrames - i) / 2000 : 1;
      val *= tailFade;

      left[i] = val;
      right[i] = val;
    }

    const blob = audioBufferToWavBlob(buffer);
    return {
      name: item.name,
      blob,
      duration: item.duration,
      text: item.text,
    };
  });

  return Promise.resolve(results);
}

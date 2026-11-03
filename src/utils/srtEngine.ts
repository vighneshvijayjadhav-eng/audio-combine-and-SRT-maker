import { AudioClipItem, StitchOptions, SubtitleCue } from '../types';

/**
 * Format seconds into SRT timestamp: HH:MM:SS,mmm
 */
export function formatSrtTimestamp(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const totalMs = Math.round(seconds * 1000);
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Format seconds into WebVTT timestamp: HH:MM:SS.mmm
 */
export function formatVttTimestamp(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  const totalMs = Math.round(seconds * 1000);
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/**
 * Split text for an audio segment into subtitle chunks based on mode:
 * - 'words': Grouping by 1 to 10 words per subtitle
 * - 'lines': Respecting line breaks or punctuation
 */
export function splitTextIntoChunks(text: string, mode: 'words' | 'lines', wordsPerSub: number): string[] {
  const clean = text.trim();
  if (!clean) return [];

  if (mode === 'lines') {
    const lines = clean
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);
    return lines.length > 0 ? lines : [clean];
  }

  // Word-count grouping (1 to 10 words)
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const clampedWords = Math.max(1, Math.min(10, Math.round(wordsPerSub)));
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += clampedWords) {
    chunks.push(words.slice(i, i + clampedWords).join(' '));
  }

  return chunks;
}

/**
 * Proportionally distribute duration across subtitle chunks.
 * In 'chars' mode, longer words receive slightly more speaking time,
 * matching natural speech rates while guaranteeing the sum strictly equals totalDuration.
 */
export function computeChunkDurations(
  chunks: string[],
  totalDuration: number,
  weightMode: 'chars' | 'equal' = 'chars'
): number[] {
  if (chunks.length === 0) return [];
  if (chunks.length === 1) return [totalDuration];

  if (weightMode === 'equal') {
    const equalShare = totalDuration / chunks.length;
    return new Array(chunks.length).fill(equalShare);
  }

  // Character-weighted speech pacing
  const weights = chunks.map(chunk => {
    // Strip whitespace to measure visible phoneme/character volume
    const charsOnly = chunk.replace(/\s+/g, '');
    // Minimum base weight of 2 characters so short words aren't too fleeting
    return Math.max(2, charsOnly.length);
  });

  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  const durations = weights.map(w => (w / totalWeight) * totalDuration);

  // Eliminate floating point rounding discrepancy on the final cue
  const currentSum = durations.reduce((a, b) => a + b, 0);
  const delta = totalDuration - currentSum;
  durations[durations.length - 1] += delta;

  return durations;
}

/**
 * Generate all SRT/VTT subtitle cues across the list of audio clips.
 */
export function generateSubtitles(
  clips: AudioClipItem[],
  options: StitchOptions
): { cues: SubtitleCue[]; srtContent: string; vttContent: string } {
  const cues: SubtitleCue[] = [];
  const gapSeconds = Math.max(0, options.gapMs / 1000);
  let currentTime = 0;
  let cueCounter = 1;

  clips.forEach((clip, clipIndex) => {
    const clipDur = clip.duration || 0;
    const clipText = clip.scriptText || '';

    const chunks = splitTextIntoChunks(clipText, options.mode, options.wordsPerSub);

    if (chunks.length === 0) {
      currentTime += clipDur + gapSeconds;
      return;
    }

    const durations = computeChunkDurations(chunks, clipDur, options.weightMode);
    const clipStartTime = currentTime;
    let subStart = clipStartTime;

    chunks.forEach((chunk, chunkIdx) => {
      const dur = durations[chunkIdx];
      let subEnd = subStart + dur;

      // Lock the end of the last chunk to the exact clip boundary
      if (chunkIdx === chunks.length - 1) {
        subEnd = clipStartTime + clipDur;
      }

      cues.push({
        index: cueCounter,
        start: subStart,
        end: subEnd,
        startFormatted: formatSrtTimestamp(subStart),
        endFormatted: formatSrtTimestamp(subEnd),
        text: chunk,
        clipIndex,
      });

      cueCounter++;
      subStart = subEnd;
    });

    currentTime += clipDur + gapSeconds;
  });

  // Build SRT formatted text
  const srtLines: string[] = [];
  cues.forEach(cue => {
    srtLines.push(String(cue.index));
    srtLines.push(`${cue.startFormatted} --> ${cue.endFormatted}`);
    srtLines.push(cue.text);
    srtLines.push(''); // blank line separator
  });

  // Build WebVTT formatted text
  const vttLines: string[] = ['WEBVTT', ''];
  cues.forEach(cue => {
    vttLines.push(String(cue.index));
    vttLines.push(`${formatVttTimestamp(cue.start)} --> ${formatVttTimestamp(cue.end)}`);
    vttLines.push(cue.text);
    vttLines.push('');
  });

  return {
    cues,
    srtContent: srtLines.join('\n'),
    vttContent: vttLines.join('\n'),
  };
}

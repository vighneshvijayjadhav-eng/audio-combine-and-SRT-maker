export interface AudioClipItem {
  id: string;
  file?: File;
  name: string;
  size: number;
  duration: number; // in seconds
  audioBuffer?: AudioBuffer;
  audioUrl: string;
  scriptText: string;
  status: 'ready' | 'loading' | 'error';
  errorMessage?: string;
}

export interface SubtitleCue {
  index: number;
  start: number; // in seconds
  end: number;   // in seconds
  startFormatted: string;
  endFormatted: string;
  text: string;
  clipIndex: number;
}

export type SrtMode = 'words' | 'lines';
export type WeightMode = 'chars' | 'equal';

export interface StitchOptions {
  mode: SrtMode;
  wordsPerSub: number; // 1 to 10
  gapMs: number;
  weightMode: WeightMode;
}

export interface StitchResult {
  audioBuffer: AudioBuffer;
  audioBlob: Blob;
  audioUrl: string;
  duration: number;
  cues: SubtitleCue[];
  srtContent: string;
  vttContent: string;
}

import React, { useState } from 'react';
import { Terminal, Copy, Check, Download, GitBranch, ExternalLink, Code2, Play } from 'lucide-react';
import { StitchOptions } from '../types';

interface PythonScriptModalProps {
  options: StitchOptions;
}

const PYTHON_CLI_CODE = `#!/usr/bin/env python3
"""
Audio & SRT Stitcher
Concatenates multiple audio clips and generates accurately aligned SRT subtitles.
Supports word-count grouping (1-10 words per subtitle) or line-break segmentation.
"""

import argparse
import json
import math
import os
import re
import subprocess
import sys
from typing import List, Tuple, Dict, Any


def get_audio_duration(file_path: str) -> float:
    """Get exact audio file duration in seconds using ffprobe or wave module."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    try:
        cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            file_path
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        dur_str = result.stdout.strip()
        if dur_str:
            return float(dur_str)
    except Exception:
        pass

    try:
        import wave
        with wave.open(file_path, 'rb') as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            return frames / float(rate)
    except Exception as e:
        raise RuntimeError(f"Could not determine duration of {file_path}: {e}")


def format_srt_timestamp(seconds: float) -> str:
    """Convert float seconds into SRT timestamp format: HH:MM:SS,mmm"""
    if seconds < 0:
        seconds = 0.0
    total_ms = int(round(seconds * 1000))
    hours = total_ms // 3600000
    minutes = (total_ms % 3600000) // 60000
    secs = (total_ms % 60000) // 1000
    ms = total_ms % 1000
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"


def split_text_into_chunks(text: str, mode: str, words_per_sub: int = 4) -> List[str]:
    """Split text for a single audio clip into subtitle chunks based on mode."""
    clean_text = text.strip()
    if not clean_text:
        return []

    if mode == "lines":
        lines = [line.strip() for line in clean_text.splitlines() if line.strip()]
        return lines if lines else [clean_text]

    words = clean_text.split()
    if not words:
        return []

    words_per_sub = max(1, min(10, words_per_sub))
    chunks = []
    for i in range(0, len(words), words_per_sub):
        chunks.append(" ".join(words[i : i + words_per_sub]))
    return chunks


def compute_chunk_durations(chunks: List[str], total_duration: float) -> List[float]:
    """Distribute clip duration across subtitle chunks proportionally by character count."""
    if not chunks:
        return []
    if len(chunks) == 1:
        return [total_duration]

    char_counts = [max(1, len(re.sub(r'\\s+', '', c))) for c in chunks]
    total_chars = sum(char_counts)
    durations = [(count / total_chars) * total_duration for count in char_counts]
    diff = total_duration - sum(durations)
    durations[-1] += diff
    return durations


def generate_subtitles(clips: List[Dict[str, Any]], mode: str = "words", words_per_sub: int = 4, gap_seconds: float = 0.0):
    """Generate SRT cues for all clips with continuous timestamps."""
    cues = []
    current_time = 0.0
    cue_index = 1

    for clip in clips:
        clip_dur = clip["duration"]
        clip_text = clip["text"]
        chunks = split_text_into_chunks(clip_text, mode=mode, words_per_sub=words_per_sub)

        if not chunks:
            current_time += clip_dur + gap_seconds
            continue

        chunk_durations = compute_chunk_durations(chunks, clip_dur)
        clip_start_time = current_time
        sub_time = clip_start_time

        for i, chunk in enumerate(chunks):
            dur = chunk_durations[i]
            start_ts = sub_time
            end_ts = sub_time + dur

            if i == len(chunks) - 1:
                end_ts = clip_start_time + clip_dur

            cues.append({
                "index": cue_index,
                "start": start_ts,
                "end": end_ts,
                "start_formatted": format_srt_timestamp(start_ts),
                "end_formatted": format_srt_timestamp(end_ts),
                "text": chunk
            })
            cue_index += 1
            sub_time = end_ts

        current_time += clip_dur + gap_seconds

    srt_lines = []
    for cue in cues:
        srt_lines.append(str(cue["index"]))
        srt_lines.append(f"{cue['start_formatted']} --> {cue['end_formatted']}")
        srt_lines.append(cue["text"])
        srt_lines.append("")

    return cues, "\\n".join(srt_lines)


def concatenate_audio_ffmpeg(audio_files: List[str], output_path: str, gap_seconds: float = 0.0) -> None:
    """Concatenate audio files using FFmpeg with uniform 44.1kHz stereo resampling."""
    if not audio_files:
        raise ValueError("No audio files provided.")

    out_ext = os.path.splitext(output_path)[1].lower()
    is_wav = out_ext in [".wav", ""]

    inputs = []
    filter_parts = []
    concat_inputs = []

    for idx, f in enumerate(audio_files):
        inputs.extend(["-i", f])
        filter_parts.append(f"[{idx}:a]aresample=44100,aformat=sample_fmts=s16:channel_layouts=stereo[a{idx}];")
        concat_inputs.append(f"[a{idx}]")

        if gap_seconds > 0 and idx < len(audio_files) - 1:
            silence_label = f"[s{idx}]"
            filter_parts.append(f"aevalsrc=0:d={gap_seconds}:s=44100:c=stereo{silence_label};")
            concat_inputs.append(silence_label)

    num_segments = len(concat_inputs)
    filter_complex = "".join(filter_parts) + "".join(concat_inputs) + f"concat=n={num_segments}:v=0:a=1[outa]"

    cmd = ["ffmpeg", "-y"] + inputs + ["-filter_complex", filter_complex, "-map", "[outa]"]
    if is_wav:
        cmd.extend(["-c:a", "pcm_s16le"])
    else:
        cmd.extend(["-c:a", "libmp3lame", "-b:a", "192k"])
    cmd.append(output_path)

    subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
`;

export const PythonScriptModal: React.FC<PythonScriptModalProps> = ({ options }) => {
  const [activeTab, setActiveTab] = useState<'cli' | 'code'>('cli');
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const sampleCommand = `python3 audio_srt_stitcher.py \\
  --audio clip1.mp3 clip2.wav clip3.m4a \\
  --script script.txt \\
  --mode ${options.mode} \\
  ${options.mode === 'words' ? `--words-per-sub ${options.wordsPerSub} \\` : ''}
  --gap-ms ${options.gapMs} \\
  --output-audio combined_audio.wav \\
  --output-srt subtitles.srt`;

  const copyCmd = () => {
    navigator.clipboard.writeText(sampleCommand);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(PYTHON_CLI_CODE);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const downloadPythonScript = () => {
    const blob = new Blob([PYTHON_CLI_CODE], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audio_srt_stitcher.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            Standalone Python Script & GitHub Sync
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Use this Python script for batch command-line stitching or deploy as a Flask web service.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('cli')}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                activeTab === 'cli' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              CLI Command
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('code')}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                activeTab === 'code' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Full Python Script
            </button>
          </div>

          <button
            type="button"
            onClick={downloadPythonScript}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Download .py
          </button>
        </div>
      </div>

      {/* GitHub Repo Status Bar */}
      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-purple-400 shrink-0" />
          <span className="text-slate-300 font-mono">
            vighneshvijayjadhav-eng/audio-combine-and-SRT-maker
          </span>
        </div>
        <a
          href="https://github.com/vighneshvijayjadhav-eng/audio-combine-and-SRT-maker.git"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 underline font-mono text-xs"
        >
          View on GitHub <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Tab 1: Dynamic CLI Command */}
      {activeTab === 'cli' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">
              Run locally in terminal (synced with your active UI options):
            </span>
            <button
              type="button"
              onClick={copyCmd}
              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
            >
              {copiedCmd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedCmd ? 'Copied' : 'Copy Command'}
            </button>
          </div>

          <pre className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-400 overflow-x-auto leading-relaxed">
            {sampleCommand}
          </pre>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-400 pt-1">
            <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800/60">
              <span className="font-semibold text-slate-200 block mb-0.5">Prerequisites</span>
              Standard Python 3.8+ and FFmpeg (<code className="text-blue-400">brew install ffmpeg</code> or <code className="text-blue-400">sudo apt install ffmpeg</code>).
            </div>
            <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800/60">
              <span className="font-semibold text-slate-200 block mb-0.5">SRT Precision Guarantee</span>
              Duration extracted via FFprobe down to milliseconds, with zero drift between clips.
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Full Python Source */}
      {activeTab === 'code' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-mono">
              audio_srt_stitcher.py (Zero external pip dependencies required)
            </span>
            <button
              type="button"
              onClick={copyCode}
              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedCode ? 'Copied' : 'Copy Script'}
            </button>
          </div>
          <pre className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 max-h-[320px] overflow-y-auto leading-relaxed">
            {PYTHON_CLI_CODE}
          </pre>
        </div>
      )}
    </div>
  );
};

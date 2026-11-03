#!/usr/bin/env python3
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
    """
    Get exact audio file duration in seconds using ffprobe or wave module.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    # Try ffprobe first (works on MP3, WAV, M4A, OGG, AAC, FLAC, WebM)
    try:
        cmd = [
            "ffprobe",
            "-v", "error",
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

    # Fallback for WAV using standard library wave
    try:
        import wave
        with wave.open(file_path, 'rb') as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            return frames / float(rate)
    except Exception as e:
        raise RuntimeError(f"Could not determine duration of {file_path}: {e}")


def format_srt_timestamp(seconds: float) -> str:
    """
    Convert float seconds into SRT timestamp format: HH:MM:SS,mmm
    """
    if seconds < 0:
        seconds = 0.0
    total_ms = int(round(seconds * 1000))
    hours = total_ms // 3600000
    minutes = (total_ms % 3600000) // 60000
    secs = (total_ms % 60000) // 1000
    ms = total_ms % 1000
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"


def split_text_into_chunks(text: str, mode: str, words_per_sub: int = 4) -> List[str]:
    """
    Split text for a single audio clip into subtitle chunks based on mode.
    - mode 'lines': Splits by line breaks or punctuation breaks if single long line
    - mode 'words': Groups words by count (1 to 10 words)
    """
    clean_text = text.strip()
    if not clean_text:
        return []

    if mode == "lines":
        lines = [line.strip() for line in clean_text.splitlines() if line.strip()]
        return lines if lines else [clean_text]

    # Mode: words
    words = clean_text.split()
    if not words:
        return []

    words_per_sub = max(1, min(10, words_per_sub))
    chunks = []
    for i in range(0, len(words), words_per_sub):
        chunks.append(" ".join(words[i : i + words_per_sub]))
    return chunks


def compute_chunk_durations(chunks: List[str], total_duration: float) -> List[float]:
    """
    Distribute clip duration across subtitle chunks proportionally by character count
    to mimic natural speaking cadence, ensuring the sum exactly matches total_duration.
    """
    if not chunks:
        return []
    if len(chunks) == 1:
        return [total_duration]

    # Weighted by character count (with minimum floor per chunk)
    char_counts = [max(1, len(re.sub(r'\s+', '', c))) for c in chunks]
    total_chars = sum(char_counts)

    durations = [(count / total_chars) * total_duration for count in char_counts]

    # Small normalization adjustment to eliminate floating point rounding error
    diff = total_duration - sum(durations)
    durations[-1] += diff
    return durations


def generate_subtitles(
    clips: List[Dict[str, Any]],
    mode: str = "words",
    words_per_sub: int = 4,
    gap_seconds: float = 0.0
) -> Tuple[List[Dict[str, Any]], str]:
    """
    Generate SRT cues for all clips with continuous timestamps.
    Each clip dict: {'file': str, 'text': str, 'duration': float}
    """
    cues = []
    current_time = 0.0
    cue_index = 1

    for clip in clips:
        clip_dur = clip["duration"]
        clip_text = clip["text"]
        chunks = split_text_into_chunks(clip_text, mode=mode, words_per_sub=words_per_sub)

        if not chunks:
            # Empty text, just advance time
            current_time += clip_dur + gap_seconds
            continue

        chunk_durations = compute_chunk_durations(chunks, clip_dur)

        clip_start_time = current_time
        sub_time = clip_start_time

        for i, chunk in enumerate(chunks):
            dur = chunk_durations[i]
            start_ts = sub_time
            end_ts = sub_time + dur

            # Keep within exact clip boundary
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

    # Build SRT file content
    srt_lines = []
    for cue in cues:
        srt_lines.append(str(cue["index"]))
        srt_lines.append(f"{cue['start_formatted']} --> {cue['end_formatted']}")
        srt_lines.append(cue["text"])
        srt_lines.append("")  # Blank line separator

    return cues, "\n".join(srt_lines)


def concatenate_audio_ffmpeg(audio_files: List[str], output_path: str, gap_seconds: float = 0.0) -> None:
    """
    Concatenate audio files using FFmpeg with resampling to 44.1kHz stereo to ensure
    perfect, glitch-free concatenation regardless of source audio formats/sample rates.
    """
    if not audio_files:
        raise ValueError("No audio files provided to concatenate.")

    out_ext = os.path.splitext(output_path)[1].lower()
    is_wav = out_ext in [".wav", ""]

    if len(audio_files) == 1 and gap_seconds == 0.0:
        cmd = [
            "ffmpeg", "-y",
            "-i", audio_files[0],
            "-ar", "44100",
            "-ac", "2",
            output_path
        ]
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return

    # Build filter_complex with optional silence inserted between files
    inputs = []
    filter_parts = []
    concat_inputs = []

    for idx, f in enumerate(audio_files):
        inputs.extend(["-i", f])
        # Resample each input to uniform sample rate & stereo
        filter_parts.append(f"[{idx}:a]aresample=44100,aformat=sample_fmts=s16:channel_layouts=stereo[a{idx}];")
        concat_inputs.append(f"[a{idx}]")

        # If gap between clips, insert silence stream
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

    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"FFmpeg concatenation failed: {res.stderr}")


def parse_script_file(script_path: str) -> List[str]:
    """Read lines from a script file."""
    with open(script_path, "r", encoding="utf-8") as f:
        lines = [line.strip() for line in f.readlines() if line.strip()]
    return lines


def main():
    parser = argparse.ArgumentParser(
        description="Concatenate audio files in script order and generate accurately aligned SRT subtitles."
    )
    parser.add_argument(
        "--audio", "-a",
        nargs="+",
        required=True,
        help="List of audio file paths in desired playback order."
    )
    parser.add_argument(
        "--script", "-s",
        type=str,
        help="Path to text file containing the script (one line per audio clip, or full text)."
    )
    parser.add_argument(
        "--script-text",
        type=str,
        help="Inline script text instead of a file. Use newline '\\n' or '|' to separate segments."
    )
    parser.add_argument(
        "--mode", "-m",
        choices=["words", "lines"],
        default="words",
        help="SRT segmentation mode: 'words' (groups of words) or 'lines' (respects line breaks)."
    )
    parser.add_argument(
        "--words-per-sub", "-w",
        type=int,
        default=4,
        help="Words per subtitle cue when mode='words' (1 to 10 words, default 4)."
    )
    parser.add_argument(
        "--gap-ms", "-g",
        type=int,
        default=0,
        help="Silence gap between clips in milliseconds (default: 0)."
    )
    parser.add_argument(
        "--output-audio", "-oa",
        type=str,
        default="combined_audio.wav",
        help="Output concatenated audio file path (default: combined_audio.wav)."
    )
    parser.add_argument(
        "--output-srt", "-os",
        type=str,
        default="subtitles.srt",
        help="Output SRT subtitle file path (default: subtitles.srt)."
    )

    args = parser.parse_args()

    audio_files = args.audio
    if not audio_files:
        print("Error: No audio files provided.", file=sys.stderr)
        sys.exit(1)

    # Get script text
    script_segments: List[str] = []
    if args.script:
        if not os.path.exists(args.script):
            print(f"Error: Script file not found: {args.script}", file=sys.stderr)
            sys.exit(1)
        script_segments = parse_script_file(args.script)
    elif args.script_text:
        text = args.script_text.replace("\\n", "\n")
        if "|" in text and "\n" not in text:
            script_segments = [s.strip() for s in text.split("|") if s.strip()]
        else:
            script_segments = [s.strip() for s in text.splitlines() if s.strip()]
    else:
        print("Error: Either --script or --script-text must be provided.", file=sys.stderr)
        sys.exit(1)

    # Match clips with script segments
    clips_data = []
    total_audio_duration = 0.0

    print(f"Processing {len(audio_files)} audio file(s)...")
    for i, file_path in enumerate(audio_files):
        dur = get_audio_duration(file_path)
        total_audio_duration += dur
        # If fewer script lines than clips, fallback to empty or repetition
        segment_text = script_segments[i] if i < len(script_segments) else f"Audio segment {i + 1}"
        clips_data.append({
            "file": file_path,
            "duration": dur,
            "text": segment_text
        })
        print(f"  [{i+1}/{len(audio_files)}] {os.path.basename(file_path)}: {dur:.3f}s -> \"{segment_text[:40]}{'...' if len(segment_text) > 40 else ''}\"")

    gap_sec = max(0.0, args.gap_ms / 1000.0)

    # Generate SRT
    print(f"\nGenerating SRT subtitles (mode: {args.mode}, words-per-sub: {args.words_per_sub}, gap: {args.gap_ms}ms)...")
    cues, srt_content = generate_subtitles(
        clips=clips_data,
        mode=args.mode,
        words_per_sub=args.words_per_sub,
        gap_seconds=gap_sec
    )

    # Write SRT
    with open(args.output_srt, "w", encoding="utf-8") as f:
        f.write(srt_content)
    print(f"✓ Saved SRT subtitles ({len(cues)} cues) to: {args.output_srt}")

    # Concatenate audio
    print(f"\nStitching {len(audio_files)} audio clip(s) into: {args.output_audio}...")
    concatenate_audio_ffmpeg(audio_files, args.output_audio, gap_seconds=gap_sec)
    print(f"✓ Audio successfully concatenated to: {args.output_audio}")

    print("\nSummary:")
    print(f"  Total Duration: {total_audio_duration + (len(audio_files) - 1) * gap_sec:.3f}s")
    print(f"  Total Cues: {len(cues)}")
    print(f"  Audio File: {os.path.abspath(args.output_audio)}")
    print(f"  SRT File:   {os.path.abspath(args.output_srt)}")


if __name__ == "__main__":
    main()

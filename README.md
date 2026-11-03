# Audio Combine & SRT Subtitle Generator

> Combine multiple audio clips in script order and generate sample-accurate SRT subtitles with customizable 1–10 word grouping or line-wise formatting.

Includes both a **modern Web UI** (React + Vite + Express + Web Audio API) and a **standalone Python CLI & Flask script** (`audio_srt_stitcher.py` & `app.py`).

---

## Features

- **Sequential Audio Concatenation**: Stitch any number of audio clips (MP3, WAV, M4A, OGG, FLAC, AAC, WebM) into a single unified audio file (`combined_audio.wav`).
- **Precision Millisecond Timestamps**: Exact duration detection down to milliseconds (`HH:MM:SS,mmm`), eliminating subtitle drift.
- **Adjustable SRT Subtitle Modes**:
  - **Word-Count Mode**: Group words into cues of **1 to 10 words** (ideal for social video shorts, reels, or karaoke-style captions). Speech-rate weighting proportionally distributes time according to word length.
  - **Line-Wise Mode**: Respects line breaks from your input script file or text.
- **Configurable Inter-Clip Silence**: Add 0ms to 2000ms pause between audio segments.
- **Interactive Web Studio**:
  - Drag-and-drop audio clips and script files (`.txt`).
  - Audio waveform and playback preview for individual clips.
  - Real-time synchronized playback with teleprompter caption highlighting.
  - Interactive subtitle table with click-to-seek and inline editing.
  - Direct downloads for Combined Audio (`.wav`), SRT (`.srt`), and WebVTT (`.vtt`).
  - Built-in Sample Project for instant testing.
- **Standalone Python CLI**: Run from terminal on any system with Python 3 and FFmpeg.

---

## 🚀 Quick Start (Web Application)

### Install dependencies
```bash
npm install
```

### Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🐍 Standalone Python CLI (`audio_srt_stitcher.py`)

No extra pip libraries required — uses the Python standard library + FFmpeg!

### Requirements
- Python 3.8+
- [FFmpeg](https://ffmpeg.org/) installed (`sudo apt install ffmpeg` or `brew install ffmpeg`)

### CLI Usage Examples

#### 1. Group by 4 words per subtitle:
```bash
python3 audio_srt_stitcher.py \
  --audio clip1.mp3 clip2.wav clip3.m4a \
  --script script.txt \
  --mode words \
  --words-per-sub 4 \
  --output-audio combined.wav \
  --output-srt subtitles.srt
```

#### 2. Group line-wise (respecting script line breaks):
```bash
python3 audio_srt_stitcher.py \
  --audio clip1.wav clip2.wav \
  --script script.txt \
  --mode lines \
  --output-audio combined.wav \
  --output-srt subtitles.srt
```

#### 3. Single-word rapid captions (Karaoke / Reels style):
```bash
python3 audio_srt_stitcher.py \
  --audio clip1.mp3 clip2.mp3 \
  --script script.txt \
  --mode words \
  --words-per-sub 1 \
  --output-audio combined.wav \
  --output-srt subtitles.srt
```

#### 4. Add 200ms silence gap between clips:
```bash
python3 audio_srt_stitcher.py \
  --audio clip1.wav clip2.wav \
  --script script.txt \
  --gap-ms 200 \
  --output-audio combined.wav \
  --output-srt subtitles.srt
```

### CLI Arguments
| Argument | Description | Default |
|---|---|---|
| `--audio`, `-a` | List of audio file paths in order | Required |
| `--script`, `-s` | Path to text file containing script lines | Optional |
| `--script-text` | Inline script string (supports `\n` or `\|`) | Optional |
| `--mode`, `-m` | `words` (1–10 words/cue) or `lines` | `words` |
| `--words-per-sub`, `-w`| Number of words per cue (1–10) | `4` |
| `--gap-ms`, `-g` | Silence between clips in milliseconds | `0` |
| `--output-audio`, `-oa`| Output audio destination | `combined_audio.wav` |
| `--output-srt`, `-os` | Output subtitle destination | `subtitles.srt` |

---

## 🌐 Standalone Python Web App (`app.py`)

If you prefer a Python-based server:
```bash
python3 app.py
```
Open [http://localhost:5000](http://localhost:5000).

---

## 📂 Repository Structure

```
├── audio_srt_stitcher.py   # Standalone Python CLI stitcher & SRT generator
├── app.py                  # Standalone Python Web server interface
├── src/
│   ├── App.tsx             # Interactive React Subtitle & Audio Studio
│   ├── index.css           # Tailwind CSS styles
│   └── main.tsx            # React application entrypoint
├── index.html              # HTML shell
├── package.json            # Node.js dependencies
└── README.md               # Documentation
```

---

## License

Apache-2.0

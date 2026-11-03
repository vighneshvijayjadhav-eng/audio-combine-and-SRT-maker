#!/usr/bin/env python3
"""
Audio & SRT Stitcher Web Interface
Upload multiple audio files + script text file, stitch audio, and generate accurate SRT.
Works with Flask if installed, or runs a built-in standard library HTTP server.
"""

import os
import sys
import json
import shutil
import tempfile
import cgi
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

# Import core stitching logic from audio_srt_stitcher
try:
    import audio_srt_stitcher as stitcher
except ImportError:
    import sys
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    import audio_srt_stitcher as stitcher

UPLOAD_DIR = os.path.join(tempfile.gettempdir(), "audio_srt_stitcher_web")
os.makedirs(UPLOAD_DIR, exist_ok=True)

HTML_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Audio & SRT Stitcher Studio</title>
    <style>
        :root {
            --bg: #0b0f19;
            --surface: #131b2e;
            --surface-hover: #1c2742;
            --border: #233152;
            --primary: #3b82f6;
            --primary-hover: #2563eb;
            --text: #f1f5f9;
            --text-muted: #94a3b8;
            --success: #10b981;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background: var(--bg); color: var(--text); padding: 2rem 1rem; min-height: 100vh; display: flex; justify-content: center; }
        .container { max-width: 840px; width: 100%; }
        header { margin-bottom: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 1.25rem; }
        h1 { font-size: 1.75rem; font-weight: 700; color: #fff; margin-bottom: 0.5rem; }
        p.subtitle { color: var(--text-muted); font-size: 0.95rem; }
        .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
        .card h2 { font-size: 1.15rem; font-weight: 600; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; }
        .form-group { margin-bottom: 1.25rem; }
        label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.5rem; color: #e2e8f0; }
        .file-drop { border: 2px dashed var(--border); border-radius: 8px; padding: 1.5rem; text-align: center; cursor: pointer; transition: border-color 0.2s; }
        .file-drop:hover { border-color: var(--primary); }
        input[type="file"] { display: block; margin: 0.5rem auto 0; font-size: 0.85rem; color: var(--text-muted); }
        textarea, input[type="number"], select { width: 100%; background: #070a12; border: 1px solid var(--border); border-radius: 6px; padding: 0.65rem; color: #fff; font-size: 0.9rem; }
        textarea { resize: vertical; min-height: 120px; line-height: 1.5; font-family: monospace; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .btn { display: inline-flex; align-items: center; justify-content: center; background: var(--primary); color: #fff; font-weight: 600; font-size: 0.95rem; padding: 0.75rem 1.5rem; border-radius: 8px; border: none; cursor: pointer; width: 100%; transition: background 0.2s; }
        .btn:hover { background: var(--primary-hover); }
        .btn-download { background: var(--success); text-decoration: none; display: inline-block; padding: 0.5rem 1rem; border-radius: 6px; color: #fff; font-weight: 500; font-size: 0.875rem; margin-right: 0.5rem; }
        .results-box { background: #070a12; border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-top: 1rem; }
        .cue-list { max-height: 250px; overflow-y: auto; font-family: monospace; font-size: 0.85rem; line-height: 1.6; color: #cbd5e1; white-space: pre-wrap; background: #050810; padding: 0.75rem; border-radius: 6px; border: 1px solid #1a233a; }
        .feedback { padding: 0.75rem 1rem; border-radius: 6px; font-size: 0.875rem; margin-bottom: 1rem; }
        .feedback-info { background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); color: #93c5fd; }
        .feedback-success { background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #6ee7b7; }
        .feedback-error { background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; }
        .badge { display: inline-block; font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 4px; background: #1e293b; color: #94a3b8; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Audio & SRT Stitcher</h1>
            <p class="subtitle">Concatenate multiple audio files and generate precision-aligned subtitles (1-10 words per cue or line-wise).</p>
        </header>

        <form method="POST" action="/stitch" enctype="multipart/form-data">
            <div class="card">
                <h2>1. Upload Audio Clips</h2>
                <div class="form-group">
                    <label>Select audio files (MP3, WAV, M4A, OGG, AAC, WebM):</label>
                    <div class="file-drop">
                        <input type="file" name="audio_files" multiple accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac,.webm" required>
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem;">Select multiple files. Files will be stitched in selection/alphabetical order.</p>
                    </div>
                </div>
            </div>

            <div class="card">
                <h2>2. Script Text</h2>
                <div class="form-group">
                    <label>Upload Script File (.txt):</label>
                    <input type="file" name="script_file" accept=".txt">
                </div>
                <div class="form-group">
                    <label>Or Paste Script Text directly (one line per audio clip, or continuous text):</label>
                    <textarea name="script_text" placeholder="Paste script here...
Line 1 matches audio clip 1
Line 2 matches audio clip 2"></textarea>
                </div>
            </div>

            <div class="card">
                <h2>3. Subtitle (SRT) Settings</h2>
                <div class="grid-2">
                    <div class="form-group">
                        <label>SRT Segmentation Mode:</label>
                        <select name="mode" id="modeSelect" onchange="toggleWordsInput()">
                            <option value="words" selected>Group by Word Count (1 - 10 words)</option>
                            <option value="lines">Line-Wise (Respect Line Breaks)</option>
                        </select>
                    </div>
                    <div class="form-group" id="wordsGroup">
                        <label>Words Per Subtitle Cue (1 to 10):</label>
                        <input type="number" name="words_per_sub" min="1" max="10" value="4">
                    </div>
                </div>

                <div class="form-group">
                    <label>Silence Gap Between Clips (milliseconds):</label>
                    <input type="number" name="gap_ms" min="0" max="5000" step="50" value="0">
                </div>

                <button type="submit" class="btn">Stitch Audio & Generate SRT</button>
            </div>
        </form>
    </div>

    <script>
        function toggleWordsInput() {
            var mode = document.getElementById('modeSelect').value;
            var wordsGroup = document.getElementById('wordsGroup');
            wordsGroup.style.display = (mode === 'words') ? 'block' : 'none';
        }
    </script>
</body>
</html>
"""

# Try using Flask if available, else standard library HTTP server
try:
    from flask import Flask, request, send_file, render_template_string
    app = Flask(__name__)

    @app.route("/", methods=["GET"])
    def index():
        return render_template_string(HTML_PAGE)

    @app.route("/stitch", methods=["POST"])
    def handle_stitch():
        session_id = os.urandom(6).hex()
        work_dir = os.path.join(UPLOAD_DIR, session_id)
        os.makedirs(work_dir, exist_ok=True)

        audio_files = request.files.getlist("audio_files")
        if not audio_files or len(audio_files) == 0 or audio_files[0].filename == '':
            return "Error: No audio files uploaded.", 400

        saved_audio_paths = []
        for i, af in enumerate(audio_files):
            clean_name = f"{i+1:03d}_{os.path.basename(af.filename)}"
            dest = os.path.join(work_dir, clean_name)
            af.save(dest)
            saved_audio_paths.append(dest)

        script_text = request.form.get("script_text", "").strip()
        script_file = request.files.get("script_file")
        if script_file and script_file.filename != '':
            script_text = script_file.read().decode("utf-8", errors="ignore").strip()

        mode = request.form.get("mode", "words")
        try:
            words_per_sub = int(request.form.get("words_per_sub", 4))
        except ValueError:
            words_per_sub = 4
        words_per_sub = max(1, min(10, words_per_sub))

        try:
            gap_ms = int(request.form.get("gap_ms", 0))
        except ValueError:
            gap_ms = 0

        # Prepare clips data
        lines = [l.strip() for l in script_text.splitlines() if l.strip()]
        clips_data = []
        total_duration = 0.0

        for i, p in enumerate(saved_audio_paths):
            dur = stitcher.get_audio_duration(p)
            total_duration += dur
            seg_text = lines[i] if i < len(lines) else f"Audio segment {i + 1}"
            clips_data.append({"file": p, "duration": dur, "text": seg_text})

        gap_sec = max(0.0, gap_ms / 1000.0)
        cues, srt_content = stitcher.generate_subtitles(
            clips=clips_data,
            mode=mode,
            words_per_sub=words_per_sub,
            gap_seconds=gap_sec
        )

        out_audio_path = os.path.join(work_dir, "combined_audio.wav")
        out_srt_path = os.path.join(work_dir, "subtitles.srt")

        with open(out_srt_path, "w", encoding="utf-8") as f:
            f.write(srt_content)

        stitcher.concatenate_audio_ffmpeg(saved_audio_paths, out_audio_path, gap_seconds=gap_sec)

        result_html = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Stitching Complete</title>
            <style>
                body {{ background: #0b0f19; color: #fff; font-family: sans-serif; padding: 2rem; max-width: 800px; margin: auto; }}
                .card {{ background: #131b2e; border: 1px solid #233152; border-radius: 12px; padding: 1.5rem; margin-top: 1.5rem; }}
                .btn {{ background: #10b981; color: #fff; text-decoration: none; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 600; display: inline-block; margin-right: 0.5rem; }}
                audio {{ width: 100%; margin: 1rem 0; }}
                pre {{ background: #070a12; padding: 1rem; border-radius: 6px; max-height: 300px; overflow-y: auto; color: #94a3b8; font-size: 0.85rem; }}
            </style>
        </head>
        <body>
            <h1>✓ Stitching Complete</h1>
            <p>Successfully combined {len(saved_audio_paths)} clips (Total duration: {total_duration + (len(saved_audio_paths)-1)*gap_sec:.2f}s, {len(cues)} cues).</p>
            <div class="card">
                <h2>Listen to Combined Audio</h2>
                <audio controls src="/download/{session_id}/audio"></audio>
                <div>
                    <a class="btn" href="/download/{session_id}/audio" download="combined_audio.wav">Download Audio (.wav)</a>
                    <a class="btn" href="/download/{session_id}/srt" download="subtitles.srt">Download Subtitles (.srt)</a>
                    <a class="btn" style="background: #3b82f6;" href="/">Create Another</a>
                </div>
            </div>
            <div class="card">
                <h2>Generated Subtitle Preview</h2>
                <pre>{srt_content}</pre>
            </div>
        </body>
        </html>
        """
        return result_html

    @app.route("/download/<session_id>/audio")
    def download_audio(session_id):
        p = os.path.join(UPLOAD_DIR, session_id, "combined_audio.wav")
        return send_file(p, as_attachment=True, download_name="combined_audio.wav")

    @app.route("/download/<session_id>/srt")
    def download_srt(session_id):
        p = os.path.join(UPLOAD_DIR, session_id, "subtitles.srt")
        return send_file(p, as_attachment=True, download_name="subtitles.srt")

    def run_server(port=5000):
        print(f"Starting Flask server on http://0.0.0.0:{port}...")
        app.run(host="0.0.0.0", port=port, debug=False)

except ImportError:
    # Standard library fallback server
    class StitcherHTTPHandler(SimpleHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/" or self.path == "":
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(HTML_PAGE.encode("utf-8"))
            else:
                self.send_error(404, "Not Found")

    def run_server(port=5000):
        print(f"Starting standard HTTP server on http://0.0.0.0:{port}...")
        server = HTTPServer(("0.0.0.0", port), StitcherHTTPHandler)
        server.serve_forever()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    run_server(port)

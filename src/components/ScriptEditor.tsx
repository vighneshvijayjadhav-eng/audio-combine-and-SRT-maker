import React, { useRef, useState } from 'react';
import { FileText, Upload, Split, Copy, Check, Wand2, Loader2, Sparkles } from 'lucide-react';
import { AudioClipItem } from '../types';

interface ScriptEditorProps {
  scriptText: string;
  onScriptTextChange: (text: string) => void;
  clips: AudioClipItem[];
  onClipsChange: (clips: AudioClipItem[]) => void;
  onAutoTranscribe?: () => void;
  isTranscribing?: boolean;
}

export const ScriptEditor: React.FC<ScriptEditorProps> = ({
  scriptText,
  onScriptTextChange,
  clips,
  onClipsChange,
  onAutoTranscribe,
  isTranscribing = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string;
      if (content !== undefined) {
        onScriptTextChange(content);
        distributeLinesToClips(content);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const distributeLinesToClips = (customText?: string) => {
    const sourceText = customText !== undefined ? customText : scriptText;
    const lines = sourceText
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    if (clips.length === 0) return;

    const updated = clips.map((clip, idx) => ({
      ...clip,
      scriptText: lines[idx] !== undefined ? lines[idx] : clip.scriptText,
    }));

    onClipsChange(updated);
  };

  const collectFromClips = () => {
    const combined = clips
      .map(c => c.scriptText.trim())
      .filter(Boolean)
      .join('\n');
    onScriptTextChange(combined);
  };

  const linesCount = scriptText.split(/\r?\n/).filter(l => l.trim().length > 0).length;
  const wordsCount = scriptText.trim().split(/\s+/).filter(Boolean).length;
  const charsCount = scriptText.length;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(scriptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" />
            Script Text Input
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Type, upload, or auto-generate script from your audio clip(s).
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
          <span>{linesCount} lines</span>
          <span>·</span>
          <span>{wordsCount} words</span>
          <span>·</span>
          <span>{charsCount} chars</span>
        </div>
      </div>

      {/* Auto-Transcribe & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          {/* AI Auto-Transcribe Button */}
          {onAutoTranscribe && (
            <button
              type="button"
              onClick={onAutoTranscribe}
              disabled={isTranscribing || clips.length === 0}
              title="Automatically transcribe and generate script text from uploaded audio clip(s)"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-xs font-semibold text-white shadow-sm disabled:opacity-40 transition-all active:scale-95"
            >
              {isTranscribing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Transcribing Audio...
                </>
              ) : (
                <>
                  <Wand2 className="w-3.5 h-3.5 text-yellow-300" />
                  Auto-Generate Script from Audio
                </>
              )}
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-blue-400" />
            Upload .txt
          </button>
          <button
            type="button"
            onClick={copyToClipboard}
            disabled={!scriptText}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 disabled:opacity-40 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        {clips.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => distributeLinesToClips()}
              title="Assign each line from this script editor to audio clip 1, clip 2, etc."
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-950/60 border border-blue-800/80 hover:bg-blue-900/60 text-xs font-medium text-blue-300 transition-colors"
            >
              <Split className="w-3 h-3" />
              Apply Lines
            </button>
            <button
              type="button"
              onClick={collectFromClips}
              title="Collect text from clip cards into this script area"
              className="px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Sync
            </button>
          </div>
        )}
      </div>

      {/* Script Text Area */}
      <div className="relative">
        <textarea
          value={scriptText}
          onChange={e => onScriptTextChange(e.target.value)}
          placeholder={`Paste your script here, or leave empty to auto-generate script directly from the audio!

• Works with multiple audio clips OR a single singular audio file.
• If left empty, clicking "Stitch Audio & Generate SRT" will automatically transcribe your audio and generate the script and SRT cues.`}
          rows={9}
          className="w-full rounded-xl bg-slate-900/90 border border-slate-800 p-3.5 text-sm font-mono text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 leading-relaxed resize-y"
        />
        {!scriptText && clips.length > 0 && (
          <div className="absolute bottom-3 right-3 text-[11px] text-amber-400/90 flex items-center gap-1 bg-slate-950/80 px-2 py-1 rounded border border-amber-500/30">
            <Sparkles className="w-3 h-3" />
            No script? Auto-transcription will run automatically on stitch
          </div>
        )}
      </div>
    </div>
  );
};

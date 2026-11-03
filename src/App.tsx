/**
 * Audio & SRT Stitcher Studio
 * Audio-first automatic speech transcription, concatenation, and precision SRT generation.
 */

import React, { useState, useEffect } from 'react';
import {
  Layers,
  Sparkles,
  Play,
  RotateCcw,
  CheckCircle2,
  FileCode2,
  GitBranch,
  ExternalLink,
  Volume2,
  Wand2,
  FileText,
  ChevronDown,
  ChevronUp,
  AlertCircle
} from 'lucide-react';
import { AudioClipItem, StitchOptions, StitchResult } from './types';
import { AudioUploader } from './components/AudioUploader';
import { ScriptEditor } from './components/ScriptEditor';
import { SrtSettingsPanel } from './components/SrtSettingsPanel';
import { PlaybackStudio } from './components/PlaybackStudio';
import { PythonScriptModal } from './components/PythonScriptModal';
import {
  audioBufferToWavBlob,
  concatenateAudioBuffers,
  generateSampleClips,
  getAudioContext,
} from './utils/audioEngine';
import { generateSubtitles } from './utils/srtEngine';
import { autoGenerateScript } from './utils/transcriptionService';

export default function App() {
  const [clips, setClips] = useState<AudioClipItem[]>([]);
  const [scriptText, setScriptText] = useState<string>('');
  const [options, setOptions] = useState<StitchOptions>({
    mode: 'words',
    wordsPerSub: 4,
    gapMs: 0,
    weightMode: 'chars',
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [stitchResult, setStitchResult] = useState<StitchResult | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'studio' | 'python'>('studio');
  const [showScriptSection, setShowScriptSection] = useState(false);

  // Load sample demo on first load so user gets immediate visual delight
  useEffect(() => {
    loadSampleProject();
  }, []);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const loadSampleProject = async () => {
    try {
      const samples = await generateSampleClips();
      const ctx = getAudioContext();

      const newClips: AudioClipItem[] = [];
      const scriptLines: string[] = [];

      for (let i = 0; i < samples.length; i++) {
        const item = samples[i];
        const arrayBuf = await item.blob.arrayBuffer();
        const buffer = await ctx.decodeAudioData(arrayBuf);

        newClips.push({
          id: `sample_${i + 1}`,
          name: item.name,
          size: item.blob.size,
          duration: item.duration,
          audioBuffer: buffer,
          audioUrl: URL.createObjectURL(item.blob),
          scriptText: item.text,
          status: 'ready',
        });

        scriptLines.push(item.text);
      }

      setClips(newClips);
      setScriptText(scriptLines.join('\n'));

      // Automatically stitch sample project for instant preview
      performStitch(newClips, options, scriptLines.join('\n'));
      showNotification('Loaded sample project with 4 synchronized clips.');
    } catch (err) {
      console.error('Failed to load sample demo:', err);
    }
  };

  const clearProject = () => {
    setClips([]);
    setScriptText('');
    setStitchResult(null);
    showNotification('Workspace cleared. Upload your audio clips.');
  };

  /**
   * Handle auto-transcription for all clips without text
   */
  const handleAutoTranscribe = async (sourceClips = clips) => {
    if (sourceClips.length === 0) {
      showNotification('Please upload audio clips first.');
      return;
    }

    setIsTranscribing(true);
    setStatusMessage('Extracting speech text from audio clips in order of upload...');

    try {
      const { updatedClips, combinedScript } = await autoGenerateScript(
        sourceClips,
        (current, total, msg) => {
          setStatusMessage(msg);
        }
      );

      setClips(updatedClips);
      setScriptText(combinedScript);
      showNotification(`Extracted script from ${updatedClips.length} audio clip(s)!`);
      return { updatedClips, combinedScript };
    } catch (err) {
      console.error('Auto transcription failed:', err);
      showNotification('Failed to auto-transcribe audio.');
    } finally {
      setIsTranscribing(false);
      setStatusMessage('');
    }
  };

  /**
   * Main Stitch & SRT Generation Routine
   * Supports:
   * 1. One singular audio file OR multiple audio clips.
   * 2. Zero script input: automatically extracts speech from audio in upload order!
   * 3. Custom script override when provided.
   */
  const performStitch = async (
    targetClips = clips,
    targetOptions = options,
    explicitScript = scriptText
  ) => {
    const readyClips = targetClips.filter(
      c => c.status === 'ready' && c.audioBuffer
    );

    if (readyClips.length === 0) {
      showNotification('Please upload at least one valid audio clip.');
      return;
    }

    setIsProcessing(true);

    try {
      let activeClips = [...readyClips];

      // If user hasn't provided any script text or clip script lines,
      // automatically extract text from the audio files!
      const hasAnyScript =
        explicitScript.trim().length > 0 ||
        activeClips.some(c => c.scriptText.trim().length > 0);

      if (!hasAnyScript) {
        setStatusMessage('Extracting real speech from audio/video tracks using Speech-to-Text...');
        const transcribeResult = await autoGenerateScript(
          activeClips,
          (curr, tot, msg) => setStatusMessage(msg)
        );
        activeClips = transcribeResult.updatedClips;
        setClips(activeClips);
        setScriptText(transcribeResult.combinedScript);

        if (!transcribeResult.hasDetectedSpeech) {
          showNotification(
            'Notice: No audible spoken words were detected in the audio track. You can type or paste your script in the Script Sync section below.'
          );
        }
      } else if (explicitScript.trim().length > 0) {
        // If a script was pasted or edited, ensure lines are mapped to clips
        const lines = explicitScript
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(Boolean);

        activeClips = activeClips.map((clip, idx) => ({
          ...clip,
          scriptText:
            lines[idx] !== undefined && lines[idx].length > 0
              ? lines[idx]
              : clip.scriptText,
        }));
      }

      setStatusMessage('Stitching audio and generating sample-accurate SRT timestamps...');

      // 1. Audio buffer concatenation (or single clip buffer)
      let mergedBuffer: AudioBuffer;
      let audioBlob: Blob;
      let audioUrl: string;

      if (activeClips.length === 1) {
        // Single singular audio clip
        mergedBuffer = activeClips[0].audioBuffer!;
        audioBlob = audioBufferToWavBlob(mergedBuffer);
        audioUrl = URL.createObjectURL(audioBlob);
      } else {
        // Multiple audio clips: Concatenate in order with gap
        const gapSec = Math.max(0, targetOptions.gapMs / 1000);
        const buffers = activeClips.map(c => c.audioBuffer!);
        mergedBuffer = concatenateAudioBuffers(buffers, gapSec);
        audioBlob = audioBufferToWavBlob(mergedBuffer);
        audioUrl = URL.createObjectURL(audioBlob);
      }

      // 2. Generate millisecond-precise Subtitles (SRT + VTT)
      const { cues, srtContent, vttContent } = generateSubtitles(
        activeClips,
        targetOptions
      );

      const result: StitchResult = {
        audioBuffer: mergedBuffer,
        audioBlob,
        audioUrl,
        duration: mergedBuffer.duration,
        cues,
        srtContent,
        vttContent,
      };

      setStitchResult(result);
      showNotification(
        `✓ Ready! Processed ${activeClips.length} clip(s) (${result.duration.toFixed(
          2
        )}s) with ${cues.length} subtitle cues.`
      );
    } catch (err) {
      console.error('Stitching failed:', err);
      showNotification('Error during audio processing. Check file formats.');
    } finally {
      setIsProcessing(false);
      setStatusMessage('');
    }
  };

  const totalWords = clips.reduce((acc, c) => {
    return acc + c.scriptText.trim().split(/\s+/).filter(Boolean).length;
  }, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Bar Contract (3 Zones) */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        {/* Zone 1: Wordmark */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold shadow-md shadow-blue-500/20">
            <Layers className="w-4 h-4" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap">
            Audio & SRT Studio
          </span>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <button
            type="button"
            onClick={() => setActiveTab('studio')}
            className={`transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'studio' ? 'text-blue-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            Studio Workspace
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('python')}
            className={`transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              activeTab === 'python' ? 'text-blue-400 font-semibold' : 'hover:text-slate-200'
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5 text-emerald-400" />
            Python CLI & Repo
          </button>
          <a
            href="https://github.com/vighneshvijayjadhav-eng/audio-combine-and-SRT-maker.git"
            target="_blank"
            rel="noreferrer"
            className="hover:text-slate-200 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 font-mono text-xs"
          >
            <GitBranch className="w-3.5 h-3.5 text-purple-400" />
            GitHub
            <ExternalLink className="w-3 h-3 text-slate-500" />
          </a>
        </nav>

        {/* Zone 3: Primary Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadSampleProject}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
            Load Sample
          </button>
          <button
            type="button"
            onClick={clearProject}
            className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs font-medium transition-colors whitespace-nowrap"
          >
            Clear
          </button>
        </div>
      </header>

      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 border border-slate-700 text-slate-200 px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-xs font-medium animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        {/* Status bar if transcribing or stitching */}
        {(isProcessing || isTranscribing) && (
          <div className="rounded-xl bg-blue-950/70 border border-blue-800/80 p-3.5 flex items-center gap-3 text-xs text-blue-200 animate-pulse">
            <span className="w-4 h-4 border-2 border-blue-400/40 border-t-blue-400 rounded-full animate-spin shrink-0" />
            <span className="font-mono">{statusMessage || 'Processing audio and subtitles...'}</span>
          </div>
        )}

        {/* Mobile Tab Toggle */}
        <div className="flex md:hidden items-center p-1 bg-slate-900 rounded-lg border border-slate-800 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('studio')}
            className={`flex-1 py-1.5 rounded-md transition-colors ${
              activeTab === 'studio' ? 'bg-blue-600 text-white' : 'text-slate-400'
            }`}
          >
            Studio
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('python')}
            className={`flex-1 py-1.5 rounded-md transition-colors ${
              activeTab === 'python' ? 'bg-blue-600 text-white' : 'text-slate-400'
            }`}
          >
            Python CLI
          </button>
        </div>

        {activeTab === 'python' ? (
          <PythonScriptModal options={options} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Audio Clips (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Audio Clips Manager */}
              <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 shadow-sm">
                <AudioUploader clips={clips} onClipsChange={setClips} />
              </div>

              {/* Optional Script Sync Feature Toggle */}
              <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => setShowScriptSection(!showScriptSection)}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <div>
                      <span className="text-sm font-semibold text-slate-100">
                        Custom Script Sync (Optional)
                      </span>
                      <p className="text-xs text-slate-400">
                        Leave blank to auto-transcribe directly from audio, or expand to paste an external script.
                      </p>
                    </div>
                  </div>
                  <div className="text-slate-400 p-1">
                    {showScriptSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {showScriptSection && (
                  <div className="p-5 border-t border-slate-800/80 bg-slate-950/40">
                    <ScriptEditor
                      scriptText={scriptText}
                      onScriptTextChange={setScriptText}
                      clips={clips}
                      onClipsChange={setClips}
                      onAutoTranscribe={() => handleAutoTranscribe()}
                      isTranscribing={isTranscribing}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Settings, Generator & Player (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              {/* Settings Panel */}
              <SrtSettingsPanel
                options={options}
                onOptionsChange={newOpts => {
                  setOptions(newOpts);
                  if (stitchResult) {
                    performStitch(clips, newOpts, scriptText);
                  }
                }}
                totalWords={totalWords}
              />

              {/* Primary Action Button */}
              <button
                type="button"
                onClick={() => performStitch(clips, options, scriptText)}
                disabled={isProcessing || isTranscribing || clips.length === 0}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-blue-600/25 transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isProcessing || isTranscribing ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing Audio &amp; Generating SRT...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    {clips.length <= 1
                      ? 'Generate SRT & Copy Box'
                      : 'Stitch Audio & Generate SRT'}
                  </>
                )}
              </button>

              {/* Output Preview, Copy Box & Playback Studio */}
              {stitchResult ? (
                <PlaybackStudio
                  result={stitchResult}
                  onUpdateCueText={(idx, newText) => {
                    const updatedCues = stitchResult.cues.map(c =>
                      c.index === idx ? { ...c, text: newText } : c
                    );
                    const srtLines: string[] = [];
                    updatedCues.forEach(c => {
                      srtLines.push(String(c.index));
                      srtLines.push(`${c.startFormatted} --> ${c.endFormatted}`);
                      srtLines.push(c.text);
                      srtLines.push('');
                    });
                    setStitchResult({
                      ...stitchResult,
                      cues: updatedCues,
                      srtContent: srtLines.join('\n'),
                    });
                  }}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-slate-500">
                  <Volume2 className="w-8 h-8 mx-auto text-slate-700 mb-2" />
                  <p className="text-sm font-medium text-slate-400">
                    No combined audio generated yet.
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    Upload audio clip(s) and click &quot;Stitch Audio &amp; Generate SRT&quot; to build the SRT and copy box.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6 px-6 text-center text-xs text-slate-500">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <span>Audio &amp; SRT Stitcher Studio</span>
          <span>·</span>
          <span>16-bit PCM WAV / SRT / WebVTT</span>
          <span>·</span>
          <a
            href="https://github.com/vighneshvijayjadhav-eng/audio-combine-and-SRT-maker.git"
            target="_blank"
            rel="noreferrer"
            className="hover:text-slate-300 transition-colors"
          >
            GitHub Repository
          </a>
        </div>
      </footer>
    </div>
  );
}

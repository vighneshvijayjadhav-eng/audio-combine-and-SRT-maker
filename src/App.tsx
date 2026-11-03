/**
 * Audio & SRT Stitcher Studio
 * Main Application
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
  Volume2
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
  const [stitchResult, setStitchResult] = useState<StitchResult | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'studio' | 'python'>('studio');

  // Load sample demo on first load so user gets immediate visual & auditory delight
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
      performStitch(newClips, options);
      showNotification('Loaded sample project with 4 synchronized audio clips.');
    } catch (err) {
      console.error('Failed to load sample demo:', err);
    }
  };

  const clearProject = () => {
    setClips([]);
    setScriptText('');
    setStitchResult(null);
    showNotification('Workspace cleared. Upload your audio clips and script.');
  };

  const performStitch = async (
    targetClips = clips,
    targetOptions = options
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
      // 1. Concatenate Audio Buffers with Web Audio API
      const gapSec = Math.max(0, targetOptions.gapMs / 1000);
      const buffers = readyClips.map(c => c.audioBuffer!);
      const mergedBuffer = concatenateAudioBuffers(buffers, gapSec);

      // 2. Encode to high-fidelity 16-bit PCM WAV
      const audioBlob = audioBufferToWavBlob(mergedBuffer);
      const audioUrl = URL.createObjectURL(audioBlob);

      // 3. Generate millisecond-precise Subtitles (SRT + VTT)
      const { cues, srtContent, vttContent } = generateSubtitles(
        readyClips,
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
        `Successfully stitched ${readyClips.length} clips into ${result.duration.toFixed(
          2
        )}s audio with ${cues.length} subtitle cues!`
      );
    } catch (err) {
      console.error('Stitching failed:', err);
      showNotification('Error during audio stitching. Check file formats.');
    } finally {
      setIsProcessing(false);
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
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8 space-y-8">
        {/* View Toggle Tabs for Mobile */}
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
            {/* Left Column: Uploads & Script Editor (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Audio Clips Manager */}
              <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 shadow-sm">
                <AudioUploader
                  clips={clips}
                  onClipsChange={setClips}
                />
              </div>

              {/* Script Text Editor */}
              <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 shadow-sm">
                <ScriptEditor
                  scriptText={scriptText}
                  onScriptTextChange={setScriptText}
                  clips={clips}
                  onClipsChange={setClips}
                />
              </div>
            </div>

            {/* Right Column: Settings, Generator & Player (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              {/* Settings Panel */}
              <SrtSettingsPanel
                options={options}
                onOptionsChange={newOpts => {
                  setOptions(newOpts);
                  // If result exists, live re-generate subtitles
                  if (stitchResult) {
                    performStitch(clips, newOpts);
                  }
                }}
                totalWords={totalWords}
              />

              {/* Stitch Action CTA */}
              <button
                type="button"
                onClick={() => performStitch(clips, options)}
                disabled={isProcessing || clips.length === 0}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-blue-600/25 transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Stitching Audio & Generating Subtitles...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    Stitch Audio & Generate SRT
                  </>
                )}
              </button>

              {/* Output Preview & Playback Studio */}
              {stitchResult ? (
                <PlaybackStudio
                  result={stitchResult}
                  onUpdateCueText={(idx, newText) => {
                    // Update cue text in stitchResult
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
                    Click &quot;Stitch Audio &amp; Generate SRT&quot; or &quot;Load Sample&quot; to preview.
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
          <span>Audio & SRT Stitcher Studio</span>
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

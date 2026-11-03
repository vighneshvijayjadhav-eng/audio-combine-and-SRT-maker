import React, { useRef, useState } from 'react';
import { UploadCloud, Music, Play, Pause, Trash2, ArrowUp, ArrowDown, AlertCircle, Clock, Volume2 } from 'lucide-react';
import { AudioClipItem } from '../types';
import { decodeAudioFile, getAudioContext } from '../utils/audioEngine';

interface AudioUploaderProps {
  clips: AudioClipItem[];
  onClipsChange: (clips: AudioClipItem[]) => void;
  onSelectClipForPlay?: (clip: AudioClipItem) => void;
}

export const AudioUploader: React.FC<AudioUploaderProps> = ({
  clips,
  onClipsChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Stop any currently previewed single clip
  const stopSinglePreview = () => {
    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.stop();
      } catch {
        // already stopped
      }
      activeSourceRef.current = null;
    }
    setActivePlayingId(null);
  };

  const playSinglePreview = (clip: AudioClipItem) => {
    if (activePlayingId === clip.id) {
      stopSinglePreview();
      return;
    }
    stopSinglePreview();
    if (!clip.audioBuffer) return;

    try {
      const ctx = getAudioContext();
      const source = ctx.createBufferSource();
      source.buffer = clip.audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        setActivePlayingId(null);
        activeSourceRef.current = null;
      };
      source.start();
      activeSourceRef.current = source;
      setActivePlayingId(clip.id);
    } catch (err) {
      console.error('Failed to preview clip audio:', err);
    }
  };

  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f =>
      f.type.startsWith('audio/') ||
      /\.(mp3|wav|m4a|ogg|flac|aac|webm)$/i.test(f.name)
    );

    if (fileArray.length === 0) return;

    // Create temporary entries with loading state
    const newItems: AudioClipItem[] = fileArray.map((file, i) => ({
      id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${i}`,
      file,
      name: file.name,
      size: file.size,
      duration: 0,
      audioUrl: URL.createObjectURL(file),
      scriptText: '',
      status: 'loading',
    }));

    // Append to list immediately for upload feedback
    const updatedClips = [...clips, ...newItems];
    onClipsChange(updatedClips);

    // Decode in parallel
    for (const item of newItems) {
      if (!item.file) continue;
      try {
        const { buffer, duration } = await decodeAudioFile(item.file);
        item.audioBuffer = buffer;
        item.duration = duration;
        item.status = 'ready';
      } catch (err) {
        console.error(`Error decoding ${item.name}:`, err);
        item.status = 'error';
        item.errorMessage = 'Could not decode audio format.';
      }
    }

    onClipsChange([...updatedClips]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const moveClip = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= clips.length) return;
    const newClips = [...clips];
    const [moved] = newClips.splice(index, 1);
    newClips.splice(targetIdx, 0, moved);
    onClipsChange(newClips);
  };

  const removeClip = (id: string) => {
    if (activePlayingId === id) stopSinglePreview();
    onClipsChange(clips.filter(c => c.id !== id));
  };

  const updateClipText = (id: string, text: string) => {
    onClipsChange(
      clips.map(c => (c.id === id ? { ...c, scriptText: text } : c))
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const totalDuration = clips.reduce((acc, c) => acc + (c.duration || 0), 0);

  return (
    <div className="space-y-4">
      {/* Header with counts */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <Music className="w-4 h-4 text-blue-400" />
            Audio Clips ({clips.length})
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Clips will concatenate in this order. Drag or use arrows to rearrange.
          </p>
        </div>
        {clips.length > 0 && (
          <div className="text-xs text-slate-400 font-mono tabular-nums">
            Total:{' '}
            <span className="text-blue-400 font-semibold">
              {totalDuration.toFixed(2)}s
            </span>
          </div>
        )}
      </div>

      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={e => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac,.webm"
          className="hidden"
          onChange={e => {
            if (e.target.files) processFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="flex flex-col items-center justify-center gap-2">
          <div className="w-10 h-10 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-blue-400">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div>
            <span className="text-sm font-medium text-slate-200 hover:text-blue-400">
              Click to upload
            </span>{' '}
            <span className="text-sm text-slate-400">or drag audio clips here</span>
          </div>
          <p className="text-xs text-slate-500">
            MP3, WAV, M4A, OGG, FLAC, AAC, WebM (Multiple files supported)
          </p>
        </div>
      </div>

      {/* Clip List Cards */}
      {clips.length > 0 && (
        <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
          {clips.map((clip, index) => {
            const isPlaying = activePlayingId === clip.id;
            return (
              <div
                key={clip.id}
                className={`p-3.5 rounded-lg border transition-all ${
                  isPlaying
                    ? 'bg-blue-950/30 border-blue-600/50'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Sequence Order Badge */}
                  <span className="w-6 h-6 rounded bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-slate-300 flex items-center justify-center shrink-0">
                    {index + 1}
                  </span>

                  {/* Play / Pause button for this single clip */}
                  <button
                    type="button"
                    onClick={() => playSinglePreview(clip)}
                    disabled={clip.status !== 'ready'}
                    title={isPlaying ? 'Pause' : 'Preview this audio clip'}
                    className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors shrink-0 ${
                      isPlaying
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-40'
                    }`}
                  >
                    {isPlaying ? (
                      <Pause className="w-3.5 h-3.5 fill-current" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    )}
                  </button>

                  {/* Clip Name and Metadata */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-200 truncate">
                        {clip.name}
                      </p>
                      {clip.status === 'loading' && (
                        <span className="text-[11px] text-amber-400 font-mono animate-pulse">
                          Decoding...
                        </span>
                      )}
                      {clip.status === 'error' && (
                        <span className="text-[11px] text-red-400 flex items-center gap-1 font-mono">
                          <AlertCircle className="w-3 h-3" /> Error
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span className="text-slate-400 tabular-nums font-semibold">
                          {clip.duration > 0 ? `${clip.duration.toFixed(3)}s` : '--'}
                        </span>
                      </span>
                      <span>·</span>
                      <span>{formatFileSize(clip.size)}</span>
                      {clip.file && (
                        <>
                          <span>·</span>
                          <span className="uppercase text-[10px] text-slate-400">
                            {clip.file.name.split('.').pop()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Order controls */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveClip(index, 'up')}
                      title="Move clip up"
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-20 disabled:hover:bg-transparent"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index === clips.length - 1}
                      onClick={() => moveClip(index, 'down')}
                      title="Move clip down"
                      className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-20 disabled:hover:bg-transparent"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeClip(clip.id)}
                      title="Remove clip"
                      className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-800 ml-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Assigned Transcript Input per Clip */}
                <div className="mt-2.5 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-medium text-slate-400">
                      Assigned Script Line for Clip #{index + 1}:
                    </label>
                    <span className="text-[11px] font-mono text-slate-500">
                      {clip.scriptText.trim().split(/\s+/).filter(Boolean).length} words
                    </span>
                  </div>
                  <input
                    type="text"
                    value={clip.scriptText}
                    onChange={e => updateClipText(clip.id, e.target.value)}
                    placeholder={`e.g. Dialogue or speech spoken in clip ${index + 1}...`}
                    className="w-full text-xs px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

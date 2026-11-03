import React, { useRef, useState, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Download,
  Copy,
  Check,
  Volume2,
  VolumeX,
  FileText,
  Music,
  ExternalLink,
  Search,
  Sparkles
} from 'lucide-react';
import { StitchResult, SubtitleCue } from '../types';
import { formatSrtTimestamp } from '../utils/srtEngine';

interface PlaybackStudioProps {
  result: StitchResult;
  onUpdateCueText?: (cueIndex: number, newText: string) => void;
}

export const PlaybackStudio: React.FC<PlaybackStudioProps> = ({
  result,
  onUpdateCueText,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(result.duration);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedSrt, setCopiedSrt] = useState(false);
  const cueListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDuration(result.duration);
    setCurrentTime(0);
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.pause();
    }
  }, [result.audioUrl]);

  // Find active cue based on currentTime
  const activeCue = result.cues.find(
    c => currentTime >= c.start && currentTime < c.end
  );

  // Auto-scroll active cue into view
  useEffect(() => {
    if (activeCue && cueListRef.current) {
      const el = document.getElementById(`cue-row-${activeCue.index}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeCue?.index]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const seekToTime = (timeInSeconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = timeInSeconds;
      setCurrentTime(timeInSeconds);
    }
  };

  const changePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const downloadFile = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAudio = () => {
    downloadFile(result.audioBlob, 'combined_audio.wav');
  };

  const handleDownloadSrt = () => {
    const blob = new Blob([result.srtContent], { type: 'text/plain;charset=utf-8' });
    downloadFile(blob, 'subtitles.srt');
  };

  const handleDownloadVtt = () => {
    const blob = new Blob([result.vttContent], { type: 'text/vtt;charset=utf-8' });
    downloadFile(blob, 'subtitles.vtt');
  };

  const copySrtClipboard = () => {
    navigator.clipboard.writeText(result.srtContent);
    setCopiedSrt(true);
    setTimeout(() => setCopiedSrt(false), 2000);
  };

  // Filter cues for search
  const filteredCues = searchQuery.trim()
    ? result.cues.filter(c =>
        c.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.startFormatted.includes(searchQuery)
      )
    : result.cues;

  // Active word calculation within current cue
  const getHighlightedWords = () => {
    if (!activeCue) return null;
    const cueDur = activeCue.end - activeCue.start;
    const progress = Math.max(0, Math.min(1, (currentTime - activeCue.start) / cueDur));
    const words = activeCue.text.split(' ');
    const activeWordIdx = Math.min(
      words.length - 1,
      Math.floor(progress * words.length)
    );

    return words.map((w, idx) => (
      <span
        key={idx}
        className={`transition-colors duration-100 ${
          idx === activeWordIdx
            ? 'text-yellow-300 font-bold underline decoration-yellow-400 decoration-2 underline-offset-4'
            : idx < activeWordIdx
            ? 'text-white'
            : 'text-slate-400'
        }`}
      >
        {w}{' '}
      </span>
    ));
  };

  return (
    <div className="space-y-6">
      <audio
        ref={audioRef}
        src={result.audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        onLoadedMetadata={() => {
          if (audioRef.current) setDuration(audioRef.current.duration);
        }}
      />

      {/* Primary Action / Download Banner */}
      <div className="rounded-xl bg-gradient-to-r from-blue-950/60 via-slate-900 to-emerald-950/50 border border-slate-800 p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-emerald-400 font-mono">
              Ready for Export
            </span>
            <span className="text-xs text-slate-400 font-mono">
              · {result.cues.length} Subtitle Cues · {duration.toFixed(2)}s Combined Audio
            </span>
          </div>
          <h3 className="text-lg font-bold text-slate-100 mt-0.5">
            Combined Master Audio & Precision Subtitles
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadAudio}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all"
          >
            <Music className="w-4 h-4" />
            Download Audio (.wav)
          </button>

          <button
            type="button"
            onClick={handleDownloadSrt}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all"
          >
            <FileText className="w-4 h-4" />
            Download Subtitles (.srt)
          </button>

          <button
            type="button"
            onClick={handleDownloadVtt}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
          >
            .vtt
          </button>

          <button
            type="button"
            onClick={copySrtClipboard}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
          >
            {copiedSrt ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedSrt ? 'Copied SRT' : 'Copy SRT'}
          </button>
        </div>
      </div>

      {/* Teleprompter / Subtitle Video Screen Preview */}
      <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shadow-2xl">
        <div className="relative aspect-video max-h-[260px] w-full bg-gradient-to-b from-slate-900/90 to-black flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="absolute top-3 left-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
              Live Subtitle Preview
            </span>
          </div>

          <div className="absolute top-3 right-4 text-xs font-mono tabular-nums text-slate-400">
            {formatSrtTimestamp(currentTime)} / {formatSrtTimestamp(duration)}
          </div>

          {/* Subtitle Cue Text Display with Karaoke active word highlight */}
          <div className="max-w-2xl px-4 py-2">
            {activeCue ? (
              <div className="space-y-1">
                <p className="text-xl md:text-2xl font-bold tracking-tight text-white leading-relaxed drop-shadow-md">
                  {getHighlightedWords()}
                </p>
                <div className="text-[11px] font-mono text-slate-500">
                  Cue #{activeCue.index} · {activeCue.startFormatted} → {activeCue.endFormatted}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">
                {currentTime === 0
                  ? 'Press play or scrub timeline to preview synchronized subtitles.'
                  : '— Intermission / Silence —'}
              </p>
            )}
          </div>
        </div>

        {/* Player Controls Bar */}
        <div className="p-4 bg-slate-900 border-t border-slate-800/80 space-y-3">
          {/* Scrubber / Progress Bar */}
          <div className="space-y-1">
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.01}
              value={currentTime}
              onChange={e => seekToTime(Number(e.target.value))}
              className="w-full accent-blue-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[11px] font-mono text-slate-400 tabular-nums px-0.5">
              <span>{formatSrtTimestamp(currentTime)}</span>
              <span>{formatSrtTimestamp(duration)}</span>
            </div>
          </div>

          {/* Playback Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-transform active:scale-95 shadow-md"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => seekToTime(0)}
                title="Restart playback"
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Speed controls */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono ml-2">
                {[0.75, 1.0, 1.25, 1.5].map(rate => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => changePlaybackRate(rate)}
                    className={`px-2 py-1 rounded transition-colors ${
                      playbackRate === rate
                        ? 'bg-blue-600 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>

            {/* Mute button */}
            <button
              type="button"
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.muted = !isMuted;
                  setIsMuted(!isMuted);
                }
              }}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Subtitle Cues Table */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
        <div className="p-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-400" />
            <h4 className="text-sm font-semibold text-slate-100">
              Synchronized Subtitle Cues ({filteredCues.length})
            </h4>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search subtitle text or timestamp..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-md bg-slate-950 border border-slate-800 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 w-56"
            />
          </div>
        </div>

        <div ref={cueListRef} className="max-h-[380px] overflow-y-auto divide-y divide-slate-800/60">
          {filteredCues.map(cue => {
            const isActive = activeCue?.index === cue.index;
            return (
              <div
                key={cue.index}
                id={`cue-row-${cue.index}`}
                onClick={() => seekToTime(cue.start)}
                className={`p-3 transition-colors flex items-start gap-3 cursor-pointer group ${
                  isActive
                    ? 'bg-blue-950/40 border-l-2 border-l-blue-500'
                    : 'hover:bg-slate-800/50'
                }`}
              >
                <span className="font-mono text-xs font-bold text-slate-500 w-8 shrink-0 pt-0.5">
                  #{cue.index}
                </span>

                <div className="shrink-0 font-mono text-xs text-blue-400 tabular-nums pt-0.5">
                  <span>{cue.startFormatted}</span>
                  <span className="text-slate-600 mx-1">→</span>
                  <span>{cue.endFormatted}</span>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {((cue.end - cue.start)).toFixed(2)}s
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm leading-relaxed ${
                      isActive ? 'text-white font-semibold' : 'text-slate-200'
                    }`}
                  >
                    {cue.text}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    seekToTime(cue.start);
                  }}
                  title="Jump to this timestamp"
                  className="p-1 rounded text-slate-500 group-hover:text-blue-400 opacity-60 group-hover:opacity-100 transition-opacity"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

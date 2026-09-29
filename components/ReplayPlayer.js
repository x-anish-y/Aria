"use client";

/**
 * components/ReplayPlayer.js — Post-call Customer Voice Input Player & Waveform Scrubber
 *
 * Designed to replay the user's spoken microphone inputs alongside the synchronized transcript.
 * Fixed:
 * 1. WebM MediaRecorder duration infinity/zero bug resolved via prop durationMs,
 *    audioContext.decodeAudioData fallback, and safe transcript offset calculation.
 * 2. Scrubber seeking and progress bars work accurately without jumping or freezing.
 * 3. Repurposed and reframed from "Call Recording" to "User Voice Inputs" to accurately
 *    reflect client microphone capture.
 * 4. Waveform scrubber with hover tooltip, playback speed toggles (1x, 1.25x, 1.5x),
 *    and synchronized two-way transcript seeking.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Download,
  Sparkles,
  User,
  Bot,
  Mic,
} from "lucide-react";
import { springGentle } from "@/lib/motion";

// Helper to format seconds into mm:ss
function formatTime(sec) {
  if (!isFinite(sec) || isNaN(sec) || sec < 0) return "00:00";
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function ReplayPlayer({
  recordingUrl = null,
  recordingBlob = null,
  durationMs = null,
  transcript = [],
  isClassicOnly = false,
  callId = null,
  className = "",
}) {
  const audioRef = useRef(null);
  const transcriptContainerRef = useRef(null);
  const turnElementRefs = useRef({});

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [hoverTime, setHoverTime] = useState(null);
  const [activeTurnId, setActiveTurnId] = useState(null);

  // Initialize duration from prop if available and positive
  const [duration, setDuration] = useState(() => {
    if (typeof durationMs === "number" && isFinite(durationMs) && durationMs > 0) {
      return durationMs / 1000;
    }
    return 0;
  });

  // Filter out system or empty turns
  const playableTurns = useMemo(() => {
    return Array.isArray(transcript)
      ? transcript.filter((t) => t.text && t.text.trim())
      : [];
  }, [transcript]);

  // Determine duration from transcript turns if metadata is slow or unavailable
  const fallbackDurationSec = useMemo(() => {
    if (playableTurns.length === 0) return 0;
    const lastTurn = playableTurns[playableTurns.length - 1];
    const offsetSec = (lastTurn.offsetMs || 0) / 1000;
    return Math.max(1, Math.round(offsetSec + 3));
  }, [playableTurns]);

  // Guaranteed finite, non-zero effective duration
  const effectiveDuration = useMemo(() => {
    if (duration > 0 && isFinite(duration)) return duration;
    if (fallbackDurationSec > 0 && isFinite(fallbackDurationSec)) return fallbackDurationSec;
    if (currentTime > 0 && isFinite(currentTime)) return Math.ceil(currentTime);
    return 1;
  }, [duration, fallbackDurationSec, currentTime]);

  // Attempt Web Audio decoding if duration is still 0 or infinite (resolves Chrome WebM MediaRecorder bug)
  useEffect(() => {
    if (!recordingUrl && !recordingBlob) return;
    if (duration > 0 && isFinite(duration)) return;

    let isMounted = true;
    async function resolveAudioDuration() {
      try {
        let blob = recordingBlob;
        if (!blob && recordingUrl) {
          const res = await fetch(recordingUrl);
          blob = await res.blob();
        }
        if (!blob || blob.size === 0) return;

        const arrayBuffer = await blob.arrayBuffer();
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        const ctx = new AudioCtx();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        if (isMounted && audioBuffer && isFinite(audioBuffer.duration) && audioBuffer.duration > 0) {
          setDuration(audioBuffer.duration);
        }
        ctx.close().catch(() => {});
      } catch (err) {
        // Fallback to transcript duration
        console.debug("[ReplayPlayer] Web Audio duration resolve note:", err?.message || err);
      }
    }

    resolveAudioDuration();
    return () => {
      isMounted = false;
    };
  }, [recordingUrl, recordingBlob, duration]);

  // Handle Play/Pause
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((err) => {
        console.warn("[ReplayPlayer] Play failed:", err);
      });
    }
  }, [isPlaying]);

  // Handle Speed Change
  const changeSpeed = useCallback((speed) => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
    setPlaybackRate(speed);
  }, []);

  // Handle Seek
  const handleSeek = useCallback(
    (seconds) => {
      if (!isFinite(effectiveDuration) || effectiveDuration <= 0) return;
      const clamped = Math.max(0, Math.min(seconds, effectiveDuration));
      if (audioRef.current) {
        try {
          audioRef.current.currentTime = clamped;
        } catch (err) {
          console.warn("[ReplayPlayer] Seek error:", err);
        }
      }
      setCurrentTime(clamped);
    },
    [effectiveDuration]
  );

  // Handle Seeking by clicking any Turn in Transcript
  const handleTurnClick = useCallback(
    (turn) => {
      const turnStartSec = (turn.offsetMs || 0) / 1000;
      handleSeek(turnStartSec);
      if (audioRef.current && !isPlaying) {
        audioRef.current.play().catch(() => {});
      }
    },
    [handleSeek, isPlaying]
  );

  // Audio Event Listeners with finite duration protection
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (isFinite(audio.duration) && audio.duration > 0) {
        setDuration((prev) => (prev > 0 ? prev : audio.duration));
      }
      if (audio.currentTime > duration && isFinite(audio.currentTime)) {
        setDuration(audio.currentTime);
      }
    };
    const onLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, [recordingUrl, duration]);

  // Sync Active Turn with current audio playback time
  useEffect(() => {
    if (playableTurns.length === 0) return;

    const currentMs = currentTime * 1000;
    let currentActive = null;

    for (let i = 0; i < playableTurns.length; i++) {
      const turn = playableTurns[i];
      const nextTurn = playableTurns[i + 1];
      const turnStart = turn.offsetMs || 0;
      const turnEnd = nextTurn ? nextTurn.offsetMs || turnStart + 3000 : Infinity;

      if (currentMs >= turnStart && currentMs < turnEnd) {
        currentActive = turn.id;
        break;
      }
    }

    if (!currentActive && playableTurns.length > 0) {
      if (currentMs < (playableTurns[0].offsetMs || 0)) {
        currentActive = playableTurns[0].id;
      } else {
        currentActive = playableTurns[playableTurns.length - 1].id;
      }
    }

    if (currentActive !== activeTurnId) {
      setActiveTurnId(currentActive);

      // Auto-scroll active turn into view
      if (currentActive && turnElementRefs.current[currentActive]) {
        turnElementRefs.current[currentActive].scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    }
  }, [currentTime, playableTurns, activeTurnId]);

  // Deterministic 48-bar Waveform generation
  const waveformBars = useMemo(() => {
    const bars = [];
    const count = 48;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 4;
      const baseHeight = 25 + Math.sin(angle) * 35 + Math.cos(angle * 2) * 15;
      const variance = (Math.sin(i * 13) + 1) * 12;
      const height = Math.min(95, Math.max(18, Math.round(baseHeight + variance)));
      bars.push(height);
    }
    return bars;
  }, []);

  // Safe progress fraction [0, 1]
  const progressFraction = useMemo(() => {
    if (!isFinite(effectiveDuration) || effectiveDuration <= 0) return 0;
    return Math.min(1, Math.max(0, currentTime / effectiveDuration));
  }, [currentTime, effectiveDuration]);

  if (!recordingUrl && playableTurns.length === 0) {
    return (
      <div className="p-6 rounded-2xl border border-outline-variant/20 bg-surface-container/40 text-center text-xs text-on-surface-muted">
        No microphone voice input or transcript recorded for this session.
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-5 ${className}`}>
      {/* Hidden Native Audio Element */}
      {recordingUrl && (
        <audio
          ref={audioRef}
          src={recordingUrl}
          preload="metadata"
          muted={isMuted}
        />
      )}

      {/* ── Player Glass Container ── */}
      <motion.div
        layout
        transition={springGentle}
        className="relative rounded-2xl p-5 border border-outline-variant/30 bg-surface-container/70 backdrop-blur-xl shadow-xl overflow-hidden"
      >
        {/* Top Badges & Status */}
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-semibold text-ivory tracking-wide flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5 text-primary" />
              User Voice Inputs
            </span>
            <span className="text-[10px] text-primary/90 bg-primary/10 border border-primary/25 px-2 py-0.5 rounded-full flex items-center gap-1 font-mono font-medium">
              <User className="w-3 h-3" />
              Microphone Audio
            </span>
          </div>

          {/* Time Readout */}
          <div className="flex items-center gap-1.5 font-mono text-xs text-ivory/90 bg-surface-high/60 px-2.5 py-1 rounded-full border border-outline-variant/20">
            <span>{formatTime(currentTime)}</span>
            <span className="text-on-surface-muted">/</span>
            <span className="text-on-surface-muted">{formatTime(effectiveDuration)}</span>
          </div>
        </div>

        {/* Clear Subtitle Explaining Microphone Capture */}
        <p className="text-[11px] text-on-surface-muted mb-3 leading-relaxed">
          Local recording of your microphone voice inputs during the call. Click the waveform or any turn to seek.
        </p>

        {/* ── Waveform Scrubber ── */}
        <div
          className="relative h-16 w-full cursor-pointer py-1 flex items-end justify-between gap-[2px] sm:gap-1 select-none group"
          onClick={(e) => {
            if (!isFinite(effectiveDuration) || effectiveDuration <= 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const clickFraction = Math.max(
              0,
              Math.min(1, (e.clientX - rect.left) / rect.width)
            );
            handleSeek(clickFraction * effectiveDuration);
          }}
          onMouseMove={(e) => {
            if (!isFinite(effectiveDuration) || effectiveDuration <= 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const fraction = Math.max(
              0,
              Math.min(1, (e.clientX - rect.left) / rect.width)
            );
            setHoverTime(fraction * effectiveDuration);
          }}
          onMouseLeave={() => setHoverTime(null)}
          role="slider"
          aria-label="Audio scrubber"
          aria-valuenow={currentTime}
          aria-valuemin={0}
          aria-valuemax={effectiveDuration}
        >
          {waveformBars.map((barHeight, idx) => {
            const barFraction = (idx + 0.5) / waveformBars.length;
            const isPlayed = barFraction <= progressFraction;

            return (
              <div
                key={idx}
                className="flex-1 rounded-full transition-all duration-150"
                style={{
                  height: `${barHeight}%`,
                  background: isPlayed
                    ? "linear-gradient(180deg, #f2ca50 0%, #d4af37 100%)"
                    : "rgba(255, 255, 255, 0.12)",
                  boxShadow: isPlayed
                    ? "0 0 8px rgba(242, 202, 80, 0.45)"
                    : "none",
                }}
              />
            );
          })}

          {/* Hover Time Tooltip */}
          {hoverTime !== null && isFinite(hoverTime) && (
            <div
              className="absolute -top-7 transform -translate-x-1/2 px-2 py-0.5 rounded bg-black/90 border border-outline-variant/40 text-[10px] font-mono text-ivory pointer-events-none z-20 shadow-md"
              style={{
                left: `${Math.min(95, Math.max(5, (hoverTime / effectiveDuration) * 100))}%`,
              }}
            >
              {formatTime(hoverTime)}
            </div>
          )}
        </div>

        {/* ── Control Actions Bar ── */}
        <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-outline-variant/15 flex-wrap">
          {/* Main Controls: Play/Pause, Rewind, Mute */}
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={togglePlay}
              className="w-11 h-11 rounded-full bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-canvas shadow-lg hover:shadow-primary/30 transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/50"
              aria-label={isPlaying ? "Pause voice input replay" : "Play voice input replay"}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 text-black fill-black" />
              ) : (
                <Play className="w-5 h-5 text-black fill-black ml-0.5" />
              )}
            </motion.button>

            <button
              onClick={() => handleSeek(0)}
              className="w-9 h-9 rounded-full bg-surface-high/60 border border-outline-variant/20 hover:border-primary/40 flex items-center justify-center text-on-surface-muted hover:text-ivory transition-colors"
              aria-label="Restart audio from beginning"
              title="Restart from beginning"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsMuted((prev) => !prev)}
              className="w-9 h-9 rounded-full bg-surface-high/60 border border-outline-variant/20 hover:border-primary/40 flex items-center justify-center text-on-surface-muted hover:text-ivory transition-colors"
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Speed Selector Buttons */}
          <div className="flex items-center gap-1.5 bg-surface-high/60 p-1 rounded-xl border border-outline-variant/20">
            {[1, 1.25, 1.5].map((speed) => (
              <button
                key={speed}
                onClick={() => changeSpeed(speed)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all ${
                  playbackRate === speed
                    ? "bg-primary text-canvas font-semibold shadow-sm"
                    : "text-on-surface-muted hover:text-ivory"
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>

          {/* Download Local Recording Button */}
          {recordingUrl && (
            <a
              href={recordingUrl}
              download={`aria-user-input-${callId || Date.now()}.webm`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-high/60 border border-outline-variant/20 hover:border-primary/40 text-xs font-medium text-on-surface-muted hover:text-ivory transition-colors"
              title="Download your microphone recording"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export Voice Audio</span>
            </a>
          )}
        </div>
      </motion.div>

      {/* ── Synchronized Interactive Transcript View ── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-on-surface-muted px-1">
          <span className="font-semibold text-ivory tracking-wide flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            Synchronized Conversation
          </span>
          <span className="text-[11px]">Click any turn to seek audio</span>
        </div>

        <div
          ref={transcriptContainerRef}
          className="max-h-72 overflow-y-auto pr-1 space-y-2.5 rounded-2xl p-3 border border-outline-variant/20 bg-surface-container/40 backdrop-blur-md"
        >
          {playableTurns.map((turn, index) => {
            const isActive = turn.id === activeTurnId;
            const isUser = turn.speaker === "user";

            return (
              <motion.div
                key={turn.id || index}
                ref={(el) => {
                  if (el) turnElementRefs.current[turn.id] = el;
                }}
                onClick={() => handleTurnClick(turn)}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className={`p-3 rounded-xl border text-xs cursor-pointer transition-all duration-200 ${
                  isActive
                    ? isUser
                      ? "border-primary bg-primary/15 shadow-[0_0_15px_rgba(242,202,80,0.25)]"
                      : "border-secondary-light bg-secondary/15 shadow-[0_0_15px_rgba(78,222,163,0.2)]"
                    : "border-outline-variant/15 bg-surface-high/40 hover:border-outline-variant/40 hover:bg-surface-high/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    {isUser ? (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-primary">
                        <User className="w-3 h-3" />
                        Customer (You)
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-secondary-light">
                        <Bot className="w-3 h-3" />
                        Aria (Agent)
                      </span>
                    )}

                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                    )}
                  </div>

                  <span className="text-[10px] font-mono text-on-surface-muted">
                    {formatTime((turn.offsetMs || 0) / 1000)}
                  </span>
                </div>

                <p className="text-on-surface leading-relaxed">{turn.text}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

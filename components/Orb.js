"use client";

/**
 * components/Orb.js — Agent Presence Bioluminescent Orb
 *
 * Real-time audio-reactive organic sphere for Aria.
 *
 * States:
 * - idle: Slow breathing rhythm (scale 0.98 - 1.02 over 4s)
 * - connecting: Rotating champagne/emerald arc
 * - listening: Concentric ripples driven by mic AnalyserNode
 * - thinking: Orbiting shimmering particles
 * - speaking: Multi-harmonic fluid waveform deformation driven by agent AnalyserNode
 * - ended / error: Calm dormant or soft muted amber state
 *
 * Performance:
 * - Canvas 2D + SVG/CSS transforms
 * - requestAnimationFrame throttled to visibilityState
 * - Static fallback when prefers-reduced-motion is true
 */

import { useRef, useEffect, memo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { springGentle } from "@/lib/motion";

const BASE_SIZE = 260; // Internal canvas resolution

function OrbComponent({
  state = "idle",
  micAnalyser = null,
  agentAnalyser = null,
  className = "",
  size = 220,
}) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();

  // Internal animation state accumulators
  const animStateRef = useRef({
    time: 0,
    angle: 0,
    audioLevel: 0,
    targetAudioLevel: 0,
    particles: Array.from({ length: 8 }, (_, i) => ({
      angle: (i * Math.PI * 2) / 8,
      speed: 0.02 + (i % 3) * 0.008,
      radiusOffset: (i % 4) * 6 - 9,
      size: 2 + (i % 3),
      alpha: 0.4 + (i % 4) * 0.15,
    })),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || prefersReducedMotion) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Byte arrays for Web Audio Analysers
    const micData = new Uint8Array(32);
    const agentData = new Uint8Array(32);

    let isVisible = document.visibilityState === "visible";

    const onVisibilityChange = () => {
      isVisible = document.visibilityState === "visible";
      if (isVisible && !animFrameRef.current) {
        animFrameRef.current = requestAnimationFrame(render);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    let lastRenderTime = 0;
    const FRAME_DURATION = 1000 / 60; // 16.67ms cap for 60 FPS

    const render = (now) => {
      if (!isVisible) {
        animFrameRef.current = null;
        return;
      }

      animFrameRef.current = requestAnimationFrame(render);

      // Throttle rendering on 120Hz/144Hz monitors to 60 FPS
      if (now && lastRenderTime) {
        const elapsed = now - lastRenderTime;
        if (elapsed < FRAME_DURATION) {
          return;
        }
        lastRenderTime = now - (elapsed % FRAME_DURATION);
      } else {
        lastRenderTime = now || performance.now();
      }

      const st = animStateRef.current;
      st.time += 0.02;
      st.angle += 0.025;

      // 1. Read Audio Levels
      let currentLevel = 0;
      if (state === "listening" && micAnalyser) {
        try {
          micAnalyser.getByteFrequencyData(micData);
          let sum = 0;
          for (let i = 0; i < 16; i++) sum += micData[i];
          currentLevel = Math.min(sum / 16 / 128, 1.5);
        } catch {}
      } else if (state === "speaking" && agentAnalyser) {
        try {
          agentAnalyser.getByteFrequencyData(agentData);
          let sum = 0;
          for (let i = 0; i < 16; i++) sum += agentData[i];
          currentLevel = Math.min(sum / 16 / 128, 1.5);
        } catch {}
      } else if (state === "speaking") {
        // Fallback simulated speech cadence if AnalyserNode is synthetic
        currentLevel = 0.35 + Math.sin(st.time * 6) * 0.2 + Math.cos(st.time * 11) * 0.15;
      }

      // Smooth audio level with lerp
      st.audioLevel += (currentLevel - st.audioLevel) * 0.25;

      // 2. Clear canvas
      ctx.clearRect(0, 0, BASE_SIZE, BASE_SIZE);

      const cx = BASE_SIZE / 2;
      const cy = BASE_SIZE / 2;
      const baseRadius = 55;

      // 3. Draw State-Specific Visuals
      if (state === "idle" || state === "ended") {
        // --- Idle State: Calm Breathing Luminous Core ---
        const breath = Math.sin(st.time * 1.2) * 3;
        const r = baseRadius + breath;

        // Soft outer emerald/gold halo
        const haloGrad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 1.5);
        haloGrad.addColorStop(0, "rgba(78, 222, 163, 0.25)");
        haloGrad.addColorStop(0.6, "rgba(212, 175, 55, 0.12)");
        haloGrad.addColorStop(1, "rgba(10, 22, 16, 0)");
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Inner glowing core
        const coreGrad = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 5, cx, cy, r);
        coreGrad.addColorStop(0, "#f2ca50");
        coreGrad.addColorStop(0.4, "#10b981");
        coreGrad.addColorStop(0.85, "#0a261a");
        coreGrad.addColorStop(1, "#05110b");
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Delicate gold hairline rim
        ctx.strokeStyle = "rgba(212, 175, 55, 0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (state === "connecting") {
        // --- Connecting State: Rotating Champagne/Emerald Arc ---
        const r = baseRadius + 2;

        // Base core
        const coreGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, r);
        coreGrad.addColorStop(0, "rgba(212, 175, 55, 0.6)");
        coreGrad.addColorStop(0.5, "rgba(16, 185, 129, 0.4)");
        coreGrad.addColorStop(1, "#05110b");
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Rotating outer orbit arc
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(st.angle * 2.2);

        ctx.beginPath();
        ctx.arc(0, 0, r + 14, 0, Math.PI * 1.2);
        ctx.strokeStyle = "#f2ca50";
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.stroke();

        // Counter rotating secondary arc
        ctx.beginPath();
        ctx.arc(0, 0, r + 24, Math.PI, Math.PI * 1.8);
        ctx.strokeStyle = "rgba(78, 222, 163, 0.7)";
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        ctx.stroke();

        ctx.restore();
      } else if (state === "listening") {
        // --- Listening State: Concentric ripples modulated by mic level ---
        const pulse = st.audioLevel * 24;
        const r = baseRadius + pulse * 0.4;

        // Expanded acoustic ripple rings
        for (let ring = 1; ring <= 3; ring++) {
          const ringRadius = r + ring * 14 + (st.time * 18 * ring) % 28;
          const alpha = Math.max(0, 0.6 - (ringRadius - r) / 60) * (0.4 + st.audioLevel * 0.6);
          ctx.strokeStyle = `rgba(78, 222, 163, ${alpha})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Vibrant mic-reactive core
        const coreGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, r);
        coreGrad.addColorStop(0, "#4edea3");
        coreGrad.addColorStop(0.5, "#10b981");
        coreGrad.addColorStop(0.85, "#005137");
        coreGrad.addColorStop(1, "#05110b");
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Gold rim
        ctx.strokeStyle = "#d4af37";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (state === "thinking") {
        // --- Thinking State: Orbiting shimmering particles & radiant glow ---
        const r = baseRadius + Math.sin(st.time * 2.5) * 2;

        // Core glow
        const coreGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, r);
        coreGrad.addColorStop(0, "#ffe088");
        coreGrad.addColorStop(0.4, "#d4af37");
        coreGrad.addColorStop(0.8, "#1a3828");
        coreGrad.addColorStop(1, "#05110b");
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Shimmering orbiting particles
        st.particles.forEach((p) => {
          p.angle += p.speed;
          const orbitR = r + 18 + p.radiusOffset + Math.sin(st.time * 3 + p.angle) * 4;
          const px = cx + Math.cos(p.angle) * orbitR;
          const py = cy + Math.sin(p.angle) * orbitR;

          ctx.fillStyle = `rgba(242, 202, 80, ${p.alpha})`;
          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
          ctx.fill();

          // Particle sparkle glow
          ctx.fillStyle = `rgba(78, 222, 163, ${p.alpha * 0.4})`;
          ctx.beginPath();
          ctx.arc(px, py, p.size * 2.2, 0, Math.PI * 2);
          ctx.fill();
        });

        // Delicate orbital ring
        ctx.strokeStyle = "rgba(212, 175, 55, 0.25)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 18, 0, Math.PI * 2);
        ctx.stroke();
      } else if (state === "speaking") {
        // --- Speaking State: Multi-harmonic fluid waveform deformation ---
        const r = baseRadius;
        const amp = 8 + st.audioLevel * 22;

        ctx.save();
        ctx.beginPath();
        const steps = 60;
        for (let i = 0; i <= steps; i++) {
          const theta = (i / steps) * Math.PI * 2;
          const wave1 = Math.sin(theta * 3 + st.time * 5) * amp * 0.4;
          const wave2 = Math.sin(theta * 6 - st.time * 4) * amp * 0.3;
          const wave3 = Math.cos(theta * 2 + st.time * 3) * amp * 0.3;
          const radiusAtAngle = r + wave1 + wave2 + wave3;

          const x = cx + Math.cos(theta) * radiusAtAngle;
          const y = cy + Math.sin(theta) * radiusAtAngle;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();

        // Harmonious fluid gradient fill
        const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, r + amp);
        grad.addColorStop(0, "#f2ca50");
        grad.addColorStop(0.35, "#34d399");
        grad.addColorStop(0.7, "#0f766e");
        grad.addColorStop(1, "#05110b");
        ctx.fillStyle = grad;
        ctx.fill();

        // Harmonic edge stroke
        ctx.strokeStyle = "#ffe088";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Secondary outer harmonic ripple
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const theta = (i / steps) * Math.PI * 2;
          const wave = Math.sin(theta * 4 - st.time * 6) * amp * 0.5;
          const radiusAtAngle = r + 14 + wave;
          const x = cx + Math.cos(theta) * radiusAtAngle;
          const y = cy + Math.sin(theta) * radiusAtAngle;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(78, 222, 163, ${0.4 + st.audioLevel * 0.4})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [state, micAnalyser, agentAnalyser, prefersReducedMotion]);

  // Static variant for reduced motion
  if (prefersReducedMotion) {
    return (
      <div
        className={`relative flex items-center justify-center select-none ${className}`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <div
          className="rounded-full shadow-lg"
          style={{
            width: size * 0.6,
            height: size * 0.6,
            background: "radial-gradient(circle at 35% 35%, #f2ca50, #10b981 60%, #05110b)",
            boxShadow: "0 0 30px rgba(78, 222, 163, 0.3)",
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Ambient background glow ring */}
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none"
        animate={{
          scale:
            state === "speaking"
              ? [1, 1.08, 1]
              : state === "listening"
              ? [1, 1.05, 1]
              : state === "thinking"
              ? [1, 1.04, 1]
              : [0.98, 1.02, 0.98],
          opacity:
            state === "speaking"
              ? 0.75
              : state === "listening"
              ? 0.65
              : state === "thinking"
              ? 0.6
              : 0.35,
        }}
        transition={{
          duration: state === "speaking" ? 1.4 : state === "listening" ? 1.8 : 3.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{
          background:
            state === "speaking"
              ? "radial-gradient(circle, rgba(242, 202, 80, 0.3) 0%, rgba(16, 185, 129, 0.25) 50%, transparent 70%)"
              : state === "listening"
              ? "radial-gradient(circle, rgba(78, 222, 163, 0.35) 0%, rgba(16, 185, 129, 0.18) 50%, transparent 70%)"
              : state === "thinking"
              ? "radial-gradient(circle, rgba(212, 175, 55, 0.35) 0%, rgba(78, 222, 163, 0.15) 50%, transparent 70%)"
              : "radial-gradient(circle, rgba(16, 185, 129, 0.2) 0%, rgba(212, 175, 55, 0.1) 50%, transparent 70%)",
          filter: "blur(20px)",
        }}
      />

      {/* Render Canvas */}
      <canvas
        ref={canvasRef}
        width={BASE_SIZE}
        height={BASE_SIZE}
        className="w-full h-full relative z-10"
      />
    </div>
  );
}

export const Orb = memo(OrbComponent);

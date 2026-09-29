"use client";

/**
 * components/InsightsCharts.js — Premium Custom Animated Charts for Aura Voice Support
 *
 * Requirements:
 * 1. Donut Chart (Resolution Status Breakdown) with hover segment tooltips & center total
 * 2. Bar Chart (Customer Intents Breakdown) with animated horizontal fill & counts
 * 3. Area / Line Chart (Calls Per Day Trend) with smooth bezier curves and radiant gradient fill
 * 4. Latency Histogram (Response Latency Distribution) with animated vertical columns
 *
 * Built with pure responsive SVG + Framer Motion for zero hydration issues and crisp rendering.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package,
  RotateCcw,
  XCircle,
  HelpCircle,
  AlertCircle,
  Clock,
  CheckCircle2,
  ShieldAlert,
  PhoneCall,
  Award,
} from "lucide-react";
import { springGentle, springSnap } from "@/lib/motion";

// ── Resolution Colors ────────────────────────────────────────────────────────
const RESOLUTION_COLORS = {
  RESOLVED: { stroke: "#10b981", bg: "bg-emerald-500", text: "text-emerald-400", label: "Resolved" },
  POLICY_DECLINED: { stroke: "#f43f5e", bg: "bg-rose-500", text: "text-rose-400", label: "Policy Declined" },
  ESCALATION_NEEDED: { stroke: "#f59e0b", bg: "bg-amber-500", text: "text-amber-400", label: "Escalated" },
  UNRESOLVED: { stroke: "#fb923c", bg: "bg-orange-500", text: "text-orange-400", label: "Unresolved" },
  ABANDONED: { stroke: "#64748b", bg: "bg-slate-500", text: "text-slate-400", label: "Abandoned" },
};

// ── Intent Colors ────────────────────────────────────────────────────────────
const INTENT_COLORS = {
  ORDER_TRACKING: "#f2ca50",
  CANCELLATION: "#fb7185",
  RETURN_REFUND: "#f43f5e",
  SHIPPING_INFO: "#38bdf8",
  COD_INFO: "#34d399",
  PRODUCT_INFO: "#e879f9",
  COMPLAINT: "#fb923c",
  OUT_OF_SCOPE: "#a78bfa",
  OTHER: "#94a3b8",
};

// ── 1. Donut Chart (Resolution Breakdown) ───────────────────────────────────
export function ResolutionDonutChart({ data = {} }) {
  const [hoveredKey, setHoveredKey] = useState(null);

  const total = Object.values(data).reduce((acc, v) => acc + (Number(v) || 0), 0);

  // SVG parameters
  const size = 200;
  const strokeWidth = 26;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Compute strokeDasharray offsets
  let accumulatedPercent = 0;
  const segments = Object.entries(data)
    .filter(([_, count]) => count > 0)
    .map(([key, count]) => {
      const percent = total > 0 ? count / total : 0;
      const strokeLength = circumference * percent;
      const strokeOffset = circumference * (1 - accumulatedPercent);
      accumulatedPercent += percent;

      return {
        key,
        count,
        percent: Math.round(percent * 100),
        strokeLength,
        strokeOffset,
        config: RESOLUTION_COLORS[key] || RESOLUTION_COLORS.UNRESOLVED,
      };
    });

  const activeSegment = hoveredKey
    ? segments.find((s) => s.key === hoveredKey)
    : null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-6 p-6 rounded-3xl bg-surface-container/60 border border-outline-variant/15 backdrop-blur-xl shadow-lg">
      {/* Donut SVG */}
      <div className="relative w-48 h-48 shrink-0 flex items-center justify-center">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="w-full h-full transform -rotate-90"
        >
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-surface-highest/50"
          />

          {/* Animated Donut Segments */}
          {segments.map((seg) => (
            <motion.circle
              key={seg.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              stroke={seg.config.stroke}
              strokeWidth={hoveredKey === seg.key ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={`${seg.strokeLength} ${circumference}`}
              strokeDashoffset={seg.strokeOffset}
              strokeLinecap="round"
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: seg.strokeOffset }}
              transition={springGentle}
              onMouseEnter={() => setHoveredKey(seg.key)}
              onMouseLeave={() => setHoveredKey(null)}
              className="cursor-pointer transition-all duration-200"
            />
          ))}
        </svg>

        {/* Center Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          <span className="font-mono text-2xl font-bold text-ivory">
            {activeSegment ? activeSegment.count : total}
          </span>
          <span className="text-[10px] uppercase font-mono tracking-wider text-on-surface-muted">
            {activeSegment ? activeSegment.config.label : "Total Calls"}
          </span>
          {activeSegment && (
            <span className="text-xs font-mono font-semibold text-primary-light mt-0.5">
              {activeSegment.percent}%
            </span>
          )}
        </div>
      </div>

      {/* Legend & Breakdown List */}
      <div className="flex-1 w-full space-y-2.5">
        <h4 className="text-xs font-mono uppercase tracking-wider text-on-surface-muted mb-3">
          Resolution Status Distribution
        </h4>
        {segments.map((seg) => (
          <div
            key={seg.key}
            onMouseEnter={() => setHoveredKey(seg.key)}
            onMouseLeave={() => setHoveredKey(null)}
            className={`flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer ${
              hoveredKey === seg.key
                ? "bg-surface-highest/80 border-primary/40 shadow-sm"
                : "bg-surface-highest/30 border-outline-variant/10 hover:border-outline-variant/30"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: seg.config.stroke }}
              />
              <span className="text-xs text-on-surface font-medium">
                {seg.config.label}
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-xs">
              <span className="text-on-surface-muted">{seg.percent}%</span>
              <span className="font-semibold text-ivory w-6 text-right">
                {seg.count}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 2. Horizontal Bar Chart (Customer Intents) ──────────────────────────────
export function IntentsBarChart({ data = {} }) {
  const total = Object.values(data).reduce((acc, v) => acc + (Number(v) || 0), 0);

  const sortedIntents = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .filter(([_, count]) => count > 0);

  const maxVal = sortedIntents.length > 0 ? sortedIntents[0][1] : 1;

  const formatIntentLabel = (intentKey) => {
    return intentKey
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="p-6 rounded-3xl bg-surface-container/60 border border-outline-variant/15 backdrop-blur-xl shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="font-mono text-xs uppercase tracking-wider text-ivory font-semibold">
            Inquiry Intent Breakdown
          </h4>
          <p className="text-[11px] text-on-surface-muted">
            Frequency of customer questions by category
          </p>
        </div>
        <span className="text-xs font-mono text-secondary-light">
          {sortedIntents.length} active categories
        </span>
      </div>

      <div className="space-y-3.5 pt-2">
        {sortedIntents.map(([intentKey, count]) => {
          const percent = total > 0 ? Math.round((count / total) * 100) : 0;
          const barWidthPercent = maxVal > 0 ? (count / maxVal) * 100 : 0;
          const barColor = INTENT_COLORS[intentKey] || INTENT_COLORS.OTHER;

          return (
            <div key={intentKey} className="group">
              <div className="flex items-center justify-between text-xs mb-1.5 font-sans">
                <span className="text-on-surface group-hover:text-ivory font-medium transition-colors">
                  {formatIntentLabel(intentKey)}
                </span>
                <div className="flex items-center gap-2.5 font-mono text-xs">
                  <span className="text-on-surface-muted text-[11px]">{percent}%</span>
                  <span className="font-semibold text-ivory w-5 text-right">{count}</span>
                </div>
              </div>

              {/* Progress track */}
              <div className="h-2.5 w-full bg-surface-highest/60 rounded-full overflow-hidden p-0.5 border border-outline-variant/10">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${barWidthPercent}%` }}
                  transition={springGentle}
                  className="h-full rounded-full"
                  style={{ backgroundColor: barColor }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 3. Calls Per Day Line/Area Chart ─────────────────────────────────────────
export function CallsTrendAreaChart({ data = [] }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  if (!data || data.length === 0) return null;

  const width = 500;
  const height = 180;
  const paddingX = 40;
  const paddingY = 25;

  const maxCount = Math.max(...data.map((d) => d.count), 5);
  const minCount = 0;

  // Generate points
  const points = data.map((d, index) => {
    const x = paddingX + (index / (data.length - 1)) * (width - paddingX * 2);
    const y =
      height -
      paddingY -
      ((d.count - minCount) / (maxCount - minCount)) * (height - paddingY * 2);
    return { ...d, x, y };
  });

  // Bezier curve string generator
  const createBezierPath = (pts) => {
    if (pts.length === 0) return "";
    let path = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cpX = (p0.x + p1.x) / 2;
      path += ` C ${cpX},${p0.y} ${cpX},${p1.y} ${p1.x},${p1.y}`;
    }
    return path;
  };

  const linePath = createBezierPath(points);
  const areaPath = `${linePath} L ${points[points.length - 1].x},${
    height - paddingY
  } L ${points[0].x},${height - paddingY} Z`;

  return (
    <div className="p-6 rounded-3xl bg-surface-container/60 border border-outline-variant/15 backdrop-blur-xl shadow-lg flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h4 className="font-mono text-xs uppercase tracking-wider text-ivory font-semibold">
            Daily Call Volume Trend
          </h4>
          <p className="text-[11px] text-on-surface-muted">
            Incoming voice consultation traffic (past 7 days)
          </p>
        </div>
        <div className="font-mono text-xs text-primary-light">
          Peak: {maxCount} calls/day
        </div>
      </div>

      {/* SVG Chart Area */}
      <div className="relative w-full h-48 mt-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f2ca50" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#f2ca50" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line
            x1={paddingX}
            y1={height - paddingY}
            x2={width - paddingX}
            y2={height - paddingY}
            stroke="currentColor"
            className="text-outline-variant/20"
            strokeDasharray="4 4"
          />
          <line
            x1={paddingX}
            y1={paddingY}
            x2={width - paddingX}
            y2={paddingY}
            stroke="currentColor"
            className="text-outline-variant/20"
            strokeDasharray="4 4"
          />

          {/* Area Fill */}
          <motion.path
            d={areaPath}
            fill="url(#areaGradient)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          />

          {/* Line Stroke */}
          <motion.path
            d={linePath}
            fill="none"
            stroke="#f2ca50"
            strokeWidth="3"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, ease: "easeOut" }}
          />

          {/* Data Nodes */}
          {points.map((pt, i) => (
            <g key={i}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r="4.5"
                fill="#0d1117"
                stroke="#f2ca50"
                strokeWidth="2.5"
                className="cursor-pointer hover:r-6 transition-all"
                onMouseEnter={() => setHoveredPoint(pt)}
                onMouseLeave={() => setHoveredPoint(null)}
              />
              {/* Day Label on X Axis */}
              <text
                x={pt.x}
                y={height - 8}
                textAnchor="middle"
                fontSize="10"
                fill="currentColor"
                className="text-on-surface-muted font-mono"
              >
                {pt.day}
              </text>
            </g>
          ))}
        </svg>

        {/* Hover Tooltip */}
        <AnimatePresence>
          {hoveredPoint && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute -top-4 transform -translate-x-1/2 px-2.5 py-1 rounded-lg bg-surface-highest border border-primary/40 shadow-xl text-center pointer-events-none z-10"
              style={{
                left: `${(hoveredPoint.x / width) * 100}%`,
              }}
            >
              <div className="text-[10px] font-mono text-primary-light font-bold">
                {hoveredPoint.count} Calls
              </div>
              <div className="text-[9px] text-on-surface-muted font-mono">
                {hoveredPoint.date}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── 4. Latency Histogram ────────────────────────────────────────────────────
export function LatencyHistogramChart({ data = [] }) {
  const maxBucket = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="p-6 rounded-3xl bg-surface-container/60 border border-outline-variant/15 backdrop-blur-xl shadow-lg flex flex-col justify-between">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="font-mono text-xs uppercase tracking-wider text-ivory font-semibold">
            Response Latency Distribution
          </h4>
          <p className="text-[11px] text-on-surface-muted">
            End of customer speech to first audible AI token
          </p>
        </div>
        <span className="text-xs font-mono text-emerald-400">
          Optimal: &lt;800ms
        </span>
      </div>

      <div className="grid grid-cols-4 gap-3 items-end h-40 pt-4">
        {data.map((bucket, idx) => {
          const heightPercent = maxBucket > 0 ? (bucket.count / maxBucket) * 100 : 0;
          const isHighLatency = idx >= 3;

          return (
            <div key={bucket.range} className="flex flex-col items-center h-full justify-end group">
              <span className="font-mono text-xs font-semibold text-ivory mb-1.5 opacity-80 group-hover:opacity-100 group-hover:text-primary-light transition-colors">
                {bucket.count}
              </span>

              <div className="w-full bg-surface-highest/40 rounded-xl overflow-hidden h-28 flex items-end p-1 border border-outline-variant/15">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(heightPercent, 8)}%` }}
                  transition={springGentle}
                  className={`w-full rounded-lg ${
                    isHighLatency
                      ? "bg-gradient-to-t from-orange-500 to-amber-400"
                      : "bg-gradient-to-t from-emerald-600 to-emerald-400"
                  }`}
                />
              </div>

              <span className="text-[10px] font-mono text-on-surface-muted mt-2 text-center">
                {bucket.range}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 5. QA Quality Score Trend Chart (Task 17) ──────────────────────────────
export function QATrendLineChart({ data = [] }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  if (!data || data.length === 0) return null;

  const width = 500;
  const height = 180;
  const paddingX = 40;
  const paddingY = 25;

  const maxScore = 5.0;
  const minScore = 1.0;

  // Generate points
  const points = data.map((d, index) => {
    const x = paddingX + (index / Math.max(1, data.length - 1)) * (width - paddingX * 2);
    const score = typeof d.avgScore === "number" ? d.avgScore : 4.8;
    const y =
      height -
      paddingY -
      ((score - minScore) / (maxScore - minScore)) * (height - paddingY * 2);
    return { ...d, x, y, score };
  });

  const createBezierPath = (pts) => {
    if (pts.length === 0) return "";
    let path = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cpX = (p0.x + p1.x) / 2;
      path += ` C ${cpX},${p0.y} ${cpX},${p1.y} ${p1.x},${p1.y}`;
    }
    return path;
  };

  const linePath = createBezierPath(points);
  const areaPath = `${linePath} L ${points[points.length - 1].x},${height - paddingY} L ${points[0].x},${height - paddingY} Z`;

  return (
    <div className="p-6 rounded-3xl bg-surface-container/60 border border-outline-variant/15 backdrop-blur-xl shadow-lg flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h4 className="font-mono text-xs uppercase tracking-wider text-ivory font-semibold">
            QA Quality Score Trend
          </h4>
          <p className="text-[11px] text-on-surface-muted">
            Daily composite QA evaluation across voice sessions (1.0 to 5.0)
          </p>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-xs text-emerald-400">
          <Award className="w-3.5 h-3.5" />
          <span>Goal: &ge;4.5 / 5.0</span>
        </div>
      </div>

      <div className="relative w-full pt-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
          <defs>
            <linearGradient id="qaAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="qaLineGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="50%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#f2ca50" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="rgba(255,255,255,0.07)" strokeDasharray="3 3" />
          <line x1={paddingX} y1={height / 2} x2={width - paddingX} y2={height / 2} stroke="rgba(255,255,255,0.07)" strokeDasharray="3 3" />
          <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="rgba(255,255,255,0.12)" />

          {/* Fill Area */}
          <path d={areaPath} fill="url(#qaAreaGradient)" />

          {/* Stroke Line */}
          <motion.path
            d={linePath}
            fill="none"
            stroke="url(#qaLineGradient)"
            strokeWidth="3"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />

          {/* Interactive points */}
          {points.map((p, idx) => (
            <g key={idx} className="cursor-pointer">
              <circle
                cx={p.x}
                cy={p.y}
                r="4.5"
                fill="#0f172a"
                stroke="#10b981"
                strokeWidth="2.5"
                className="transition-transform duration-200 hover:scale-150"
                onMouseEnter={() => setHoveredPoint(p)}
                onMouseLeave={() => setHoveredPoint(null)}
              />
            </g>
          ))}
        </svg>

        {/* X-axis labels */}
        <div className="flex justify-between text-[10px] font-mono text-on-surface-muted mt-2 px-6">
          {data.map((d, i) => (
            <span key={i} className="text-center">
              {d.day}
            </span>
          ))}
        </div>

        {/* Tooltip */}
        <AnimatePresence>
          {hoveredPoint && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className="absolute pointer-events-none p-2 rounded-xl bg-surface-highest/95 border border-outline-variant/30 backdrop-blur-md shadow-xl text-center transform -translate-x-1/2 -top-10"
              style={{
                left: `${(hoveredPoint.x / width) * 100}%`,
              }}
            >
              <div className="text-[10px] font-mono text-emerald-400 font-bold">
                {hoveredPoint.score?.toFixed(1)} / 5.0 QA Rating
              </div>
              <div className="text-[9px] text-on-surface-muted font-mono">
                {hoveredPoint.date} • {hoveredPoint.count} calls
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

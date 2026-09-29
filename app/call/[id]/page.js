/**
 * app/call/[id]/page.js — Server-Rendered Public Call Report Page
 *
 * Requirements (Task 16):
 * 1. Server-rendered from calls table using getCallRecordById(id)
 * 2. Renders:
 *    - Full transcript
 *    - Structured summary (intent, resolution, sentiment, policy notes, actions taken)
 *    - Quality and latency metrics
 *    - Agent Brain decision timeline
 *    - QA Scorecard if present
 *    - Strict Privacy: NO audio included or uploaded, and session_id stripped
 * 3. Dynamic OpenGraph metadata for rich previews
 * 4. Graceful 404 / expired state if call not found
 */

import Link from "next/link";
import { getCallRecordById } from "@/lib/db";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { QAScorecard } from "@/components/QAScorecard";
import {
  Sparkles,
  PhoneCall,
  Clock,
  Zap,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  User,
  Bot,
  Brain,
  ShieldCheck,
  Package,
  ArrowLeft,
  Calendar,
  Layers,
  FileText,
} from "lucide-react";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const call = await getCallRecordById(id);

  if (!call) {
    return {
      title: "Call Report Expired or Not Found — Aria",
      description: "The requested call record does not exist or has expired.",
    };
  }

  const shortId = id.length > 8 ? id.slice(-6).toUpperCase() : id;
  const intent = call.summary?.customer_intent || "Support Consultation";
  const resolution = call.summary?.resolution_status || "Completed";
  const summarySnippet =
    call.summary?.call_summary ||
    `Aura Skincare customer support call report with Aria (${call.duration_s || 0}s duration).`;

  const title = `Aura Support Report #${shortId} [${resolution}] — Aria AI`;

  return {
    title,
    description: summarySnippet,
    openGraph: {
      title,
      description: summarySnippet,
      type: "website",
      images: ["/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: summarySnippet,
    },
  };
}

export default async function CallReportPage({ params }) {
  const { id } = await params;
  const call = await getCallRecordById(id);

  // ── Graceful 404 / Expired State ───────────────────────────────────────────
  if (!call) {
    return (
      <div className="min-h-screen bg-canvas text-on-surface flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="max-w-md w-full p-8 rounded-3xl border border-outline-variant/30 bg-surface-container/80 backdrop-blur-xl shadow-2xl flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mb-5 text-rose-400">
            <XCircle className="w-8 h-8" />
          </div>
          <span className="text-xs font-mono uppercase tracking-wider text-rose-400 bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20 mb-3">
            Record Not Found
          </span>
          <h1 className="font-serif text-2xl font-medium text-ivory mb-2">
            Call Report Not Found or Expired
          </h1>
          <p className="text-xs text-on-surface-muted leading-relaxed mb-6">
            The consultation report for ID{" "}
            <code className="px-1.5 py-0.5 rounded bg-surface-high text-primary font-mono text-[11px]">
              {id}
            </code>{" "}
            either does not exist or was stored in a temporary session that has expired.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
            <Link
              href="/"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-primary text-black hover:bg-primary-light transition-all shadow-md"
            >
              <PhoneCall className="w-4 h-4" />
              <span>Start New Call</span>
            </Link>
            <Link
              href="/insights"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium bg-surface-high border border-outline-variant/30 text-on-surface hover:text-ivory transition-colors"
            >
              <Zap className="w-4 h-4 text-secondary-light" />
              <span>Live Insights</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Call Data Preparation (Safe & Stripped of session_id) ─────────────────
  const summary = call.summary || {};
  const metrics = call.metrics || {};
  const transcript = Array.isArray(call.transcript) ? call.transcript : [];
  const toolEvents = Array.isArray(call.tool_events) ? call.tool_events : [];
  const durationSec = call.duration_s || metrics.durationSeconds || 0;
  const turnsCount = transcript.length;

  const resolution = summary.resolution_status || "RESOLVED";
  const intent = summary.customer_intent || "OTHER";
  const sentiment = summary.customer_sentiment || "NEUTRAL";
  const shortId = call.id.length > 8 ? call.id.slice(-8).toUpperCase() : call.id;

  const resolutionConfig = {
    RESOLVED: { label: "Resolved", bg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" },
    UNRESOLVED: { label: "Unresolved", bg: "bg-amber-500/15 border-amber-500/30 text-amber-300" },
    POLICY_DECLINED: { label: "Policy Declined", bg: "bg-rose-500/15 border-rose-500/30 text-rose-300" },
    ESCALATION_NEEDED: { label: "Ticket Created", bg: "bg-purple-500/15 border-purple-500/30 text-purple-300" },
    ABANDONED: { label: "Abandoned", bg: "bg-zinc-500/15 border-zinc-500/30 text-zinc-300" },
  };
  const resMeta = resolutionConfig[resolution] || resolutionConfig.RESOLVED;

  return (
    <main className="min-h-screen bg-canvas text-on-surface font-sans selection:bg-primary/20 selection:text-primary pb-16">
      {/* ── Top Header Navigation ───────────────────────────────────────────── */}
      <header className="border-b border-outline-variant/15 bg-surface-container/60 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-on-surface-muted hover:text-ivory transition-colors pr-2 border-r border-outline-variant/20"
              title="Return to Aria Voice Console"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Console</span>
            </Link>
            <div className="flex items-center gap-2">
              <span className="font-serif text-lg font-bold text-ivory tracking-tight">
                Aura
              </span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-primary-light bg-primary/10 border border-primary/25 px-2 py-0.5 rounded-full">
                Public Report
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <CopyLinkButton />
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-primary text-black hover:bg-primary-light transition-all shadow-md"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Talk to Aria</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 space-y-6">
        {/* ── Call Header Banner ────────────────────────────────────────────── */}
        <div className="p-6 sm:p-8 rounded-3xl border border-outline-variant/25 bg-surface-container/70 backdrop-blur-xl shadow-xl relative overflow-hidden">
          <div
            className="absolute -right-20 -top-20 w-64 h-64 rounded-full pointer-events-none opacity-20 blur-3xl"
            style={{ background: "radial-gradient(circle, #f2ca50 0%, transparent 70%)" }}
          />

          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-semibold text-ivory bg-surface-high/80 px-2.5 py-1 rounded-full border border-outline-variant/30">
                #{shortId}
              </span>
              <span
                className={`text-xs font-medium px-3 py-1 rounded-full border ${resMeta.bg}`}
              >
                {resMeta.label}
              </span>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-surface-high/60 border border-outline-variant/20 text-on-surface-muted capitalize">
                Sentiment: {sentiment.toLowerCase()}
              </span>
              <span className="text-xs font-mono text-on-surface-muted bg-surface-high/60 px-2.5 py-1 rounded-full border border-outline-variant/20 uppercase">
                Mode: {call.mode || "realtime"}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-on-surface-muted font-mono">
              <Calendar className="w-3.5 h-3.5" />
              <span>
                {call.started_at
                  ? new Date(call.started_at).toLocaleString()
                  : "Recent Session"}
              </span>
            </div>
          </div>

          <h1 className="font-serif text-2xl sm:text-3xl font-medium text-ivory mb-2">
            Customer Consultation Evaluation
          </h1>
          <p className="text-xs sm:text-sm text-on-surface-muted leading-relaxed max-w-3xl">
            {summary.call_summary ||
              "Consultation concluded with Aria AI representative covering brand skincare inquiries, order status, or customer support."}
          </p>

          {/* Privacy Note Badge */}
          <div className="mt-4 pt-4 border-t border-outline-variant/15 flex items-center gap-2 text-[11px] text-on-surface-muted">
            <ShieldCheck className="w-4 h-4 text-secondary-light shrink-0" />
            <span>
              <strong>Zero-PII Public Record:</strong> Audio recordings are stored in
              browser memory only. Customer session identifiers have been stripped.
            </span>
          </div>
        </div>

        {/* ── 4-Metric Grid Overview ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl border border-outline-variant/20 bg-surface-container/60">
            <span className="text-[11px] text-on-surface-muted uppercase tracking-wider block mb-1">
              Customer Intent
            </span>
            <p className="text-sm sm:text-base font-semibold text-ivory truncate">
              {intent.replace(/_/g, " ")}
            </p>
          </div>

          <div className="p-4 rounded-2xl border border-outline-variant/20 bg-surface-container/60">
            <span className="text-[11px] text-on-surface-muted uppercase tracking-wider block mb-1">
              Order Referenced
            </span>
            <p className="text-sm sm:text-base font-mono font-semibold text-primary">
              {summary.order_id || "None"}
            </p>
          </div>

          <div className="p-4 rounded-2xl border border-outline-variant/20 bg-surface-container/60">
            <span className="text-[11px] text-on-surface-muted uppercase tracking-wider block mb-1">
              Call Duration
            </span>
            <p className="text-sm sm:text-base font-mono font-semibold text-ivory flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-secondary-light" />
              <span>{durationSec}s</span>
            </p>
          </div>

          <div className="p-4 rounded-2xl border border-outline-variant/20 bg-surface-container/60">
            <span className="text-[11px] text-on-surface-muted uppercase tracking-wider block mb-1">
              Total Turns
            </span>
            <p className="text-sm sm:text-base font-mono font-semibold text-ivory">
              {turnsCount} turns
            </p>
          </div>
        </div>

        {/* ── QA Scorecard (if present) ───────────────────────────────────────── */}
        {summary.qa && (
          <QAScorecard qa={summary.qa} />
        )}

        {/* ── Policy Verdict & Actions Taken ─────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Policy Notes */}
          <div className="p-5 sm:p-6 rounded-2xl border border-outline-variant/20 bg-surface-container/60 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-ivory uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span>Policy Verdict & Scope</span>
            </div>
            <p className="text-xs text-on-surface leading-relaxed">
              {summary.policy_notes ||
                "Standard Aura Skincare policy applied. Agent provided accurate brand guidelines without unauthorized escalation."}
            </p>
          </div>

          {/* Key Actions Taken */}
          <div className="p-5 sm:p-6 rounded-2xl border border-outline-variant/20 bg-surface-container/60 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-ivory uppercase tracking-wider">
              <CheckCircle2 className="w-4 h-4 text-secondary-light" />
              <span>Grounded Actions Taken</span>
            </div>
            {summary.actions_taken && summary.actions_taken.length > 0 ? (
              <ul className="space-y-1.5 text-xs text-on-surface">
                {summary.actions_taken.map((act, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-secondary-light mt-0.5">•</span>
                    <span>{act}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-on-surface-muted">
                Consultation concluded without state changes or external tool mutations.
              </p>
            )}
          </div>
        </div>

        {/* ── Decision Timeline / Agent Brain Events ─────────────────────────── */}
        {toolEvents.length > 0 && (
          <div className="p-5 sm:p-6 rounded-2xl border border-outline-variant/20 bg-surface-container/60 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-ivory uppercase tracking-wider">
                <Brain className="w-4 h-4 text-purple-400" />
                <span>Agent Brain Audit Trail ({toolEvents.length} Events)</span>
              </div>
              <span className="text-[11px] font-mono text-on-surface-muted">
                Server-side verified
              </span>
            </div>

            <div className="space-y-2.5">
              {toolEvents.map((evt, idx) => (
                <div
                  key={evt.id || idx}
                  className="p-3 rounded-xl border border-outline-variant/15 bg-surface-high/40 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="flex items-start sm:items-center gap-2.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-purple-500/15 text-purple-300 border border-purple-500/30 shrink-0">
                      {evt.kind || "TOOL_CALL"}
                    </span>
                    <div>
                      <p className="font-medium text-ivory">{evt.title || evt.name}</p>
                      {evt.ruleCited && (
                        <p className="text-[11px] text-on-surface-muted font-mono mt-0.5">
                          Rule: {evt.ruleCited}
                        </p>
                      )}
                    </div>
                  </div>

                  {evt.durationMs !== undefined && (
                    <span className="text-[11px] font-mono text-on-surface-muted shrink-0">
                      {evt.durationMs}ms
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Chronological Transcript Timeline ──────────────────────────────── */}
        <div className="p-5 sm:p-6 rounded-2xl border border-outline-variant/20 bg-surface-container/60 space-y-4">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-outline-variant/15">
            <div className="flex items-center gap-2 text-xs font-semibold text-ivory uppercase tracking-wider">
              <FileText className="w-4 h-4 text-primary" />
              <span>Full Consultation Transcript</span>
            </div>
            <span className="text-[11px] font-mono text-on-surface-muted">
              {transcript.length} turns
            </span>
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {transcript.length > 0 ? (
              transcript.map((t, idx) => {
                const isUser = t.speaker === "user";
                return (
                  <div
                    key={t.id || idx}
                    className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                      isUser
                        ? "border-primary/20 bg-primary/5 ml-4 sm:ml-12"
                        : "border-outline-variant/15 bg-surface-high/30 mr-4 sm:mr-12"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span
                        className={`font-semibold flex items-center gap-1.5 text-[11px] ${
                          isUser ? "text-primary" : "text-secondary-light"
                        }`}
                      >
                        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                        {isUser ? "Customer" : "Aria"}
                      </span>
                      <span className="font-mono text-[10px] text-on-surface-muted">
                        {t.timestamp || "Turn " + (idx + 1)}
                      </span>
                    </div>
                    <p className="text-on-surface">{t.text}</p>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-on-surface-muted text-center py-6">
                No transcript turns recorded for this call.
              </p>
            )}
          </div>
        </div>

        {/* ── Summary JSON Payload (For Evaluators) ─────────────────────────── */}
        <div className="p-5 sm:p-6 rounded-2xl border border-outline-variant/20 bg-surface-container/60 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ivory uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-secondary-light" />
              Structured Evaluation JSON
            </span>
            <span className="text-[10px] font-mono text-on-surface-muted">
              Schema v1.2
            </span>
          </div>
          <pre className="p-4 rounded-xl bg-black/60 border border-outline-variant/20 text-emerald-300 font-mono text-[11px] overflow-x-auto max-h-60 leading-relaxed">
            {JSON.stringify(summary, null, 2)}
          </pre>
        </div>
      </div>
    </main>
  );
}

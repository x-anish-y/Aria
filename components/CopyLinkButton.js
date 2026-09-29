"use client";

import { useState } from "react";
import { Share2, Check, Copy } from "lucide-react";

export function CopyLinkButton({ className = "", label = "Share Report" }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
        copied
          ? "bg-secondary/20 text-secondary-light border border-secondary/40"
          : "bg-surface-high/80 hover:bg-surface-high text-ivory border border-outline-variant/30 hover:border-primary/50 shadow-sm"
      } ${className}`}
      title="Copy public report link to clipboard"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-secondary-light" />
          <span>Link Copied!</span>
        </>
      ) : (
        <>
          <Share2 className="w-3.5 h-3.5 text-primary-light" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

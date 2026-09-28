"use client";

/**
 * lib/useMediaQuery.js — SSR-safe media query hook
 *
 * Returns true if the given CSS media query matches.
 * Returns false during SSR and hydration to prevent mismatch.
 *
 * @param {string} query — e.g. "(min-width: 768px)"
 * @returns {boolean}
 */

import { useEffect, useState } from "react";

export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    const handler = (e) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

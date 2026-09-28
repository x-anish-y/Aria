/**
 * lib/cn.js — Utility for merging class names
 * Thin wrapper around clsx for conditional class composition.
 */
import clsx from "clsx";

/**
 * Merge class names conditionally.
 * @param {...(string|Record<string,boolean>|undefined)} inputs
 * @returns {string}
 */
export function cn(...inputs) {
  return clsx(...inputs);
}

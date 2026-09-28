/**
 * lib/motion.js — Shared Framer Motion presets
 * Central place for all animation configs so they stay consistent.
 * Every component imports from here instead of defining inline configs.
 */

// ============================================================
// SPRING CONFIGS
// ============================================================

/** Snappy spring for buttons, toggles, small interactive elements */
export const springSnap = { type: "spring", stiffness: 500, damping: 30 };

/** Gentle spring for modals, cards, larger elements */
export const springGentle = { type: "spring", stiffness: 300, damping: 28 };

/** Bouncy spring for playful interactions */
export const springBounce = { type: "spring", stiffness: 400, damping: 18 };

/** Slow spring for background elements */
export const springSlow = { type: "spring", stiffness: 100, damping: 20 };


// ============================================================
// VARIANT PRESETS — for AnimatePresence / motion components
// ============================================================

/** Fade up — standard entrance for cards, sections */
export const fadeUp = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: springGentle },
  exit:    { opacity: 0, y: -10, transition: { duration: 0.2 } },
};

/** Fade in — simple opacity */
export const fadeIn = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
  exit:    { opacity: 0, transition: { duration: 0.15 } },
};

/** Scale in — for modals, popovers */
export const scaleIn = {
  hidden:  { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1, transition: springGentle },
  exit:    { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
};

/** Slide up — for bottom sheets on mobile */
export const slideUp = {
  hidden:  { opacity: 0, y: "100%" },
  visible: { opacity: 1, y: 0, transition: springGentle },
  exit:    { opacity: 0, y: "100%", transition: { duration: 0.25 } },
};

/** Slide in from right — for side panels on desktop */
export const slideRight = {
  hidden:  { opacity: 0, x: "100%" },
  visible: { opacity: 1, x: 0, transition: springGentle },
  exit:    { opacity: 0, x: "100%", transition: { duration: 0.25 } },
};


// ============================================================
// STAGGER CONTAINERS — for lists of items
// ============================================================

/**
 * Stagger parent — wrap a list with this variant to stagger children.
 * @param {number} [stagger=0.06] — delay between each child
 * @param {number} [delayChildren=0.1] — initial delay before first child
 */
export const staggerContainer = (stagger = 0.06, delayChildren = 0.1) => ({
  hidden:  { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: stagger, delayChildren },
  },
});

/** Stagger child — each item inside a stagger container */
export const staggerItem = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: springGentle },
};


// ============================================================
// BUTTON / INTERACTIVE PRESETS
// ============================================================

/** Press animation — scale down on tap/click */
export const tapScale = { scale: 0.97 };

/** Hover animation — slight lift */
export const hoverLift = { scale: 1.02, transition: springSnap };


// ============================================================
// REDUCED MOTION — helper to respect user preference
// ============================================================

/**
 * Returns empty variants if user prefers reduced motion.
 * Use: const variants = useReducedMotion() ? reducedMotionVariants : fadeUp;
 */
export const reducedMotionVariants = {
  hidden:  {},
  visible: {},
  exit:    {},
};

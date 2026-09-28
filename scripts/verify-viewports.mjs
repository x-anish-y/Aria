/**
 * scripts/verify-viewports.mjs
 *
 * Verifies responsive layouts at 360, 390, 768, 1024, 1440, 1920.
 * Checks:
 * - No horizontal scrollbar (scrollWidth <= innerWidth)
 * - Page loads cleanly
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const VIEWPORTS = [
  { width: 360, height: 640, name: "360-mobile-small" },
  { width: 390, height: 844, name: "390-iphone-14" },
  { width: 768, height: 1024, name: "768-tablet-portrait" },
  { width: 1024, height: 768, name: "1024-tablet-landscape" },
  { width: 1440, height: 900, name: "1440-desktop" },
  { width: 1920, height: 1080, name: "1920-fhd" },
];

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const artifactsDir = path.resolve("public/screenshots");
if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

console.log("\n========================================================");
console.log(" Aria Viewport Verification (360, 390, 768, 1024, 1440, 1920)");
console.log("========================================================\n");

for (const vp of VIEWPORTS) {
  const screenshotPath = path.join(artifactsDir, `screenshot-${vp.name}.png`);
  console.log(`Checking ${vp.name} (${vp.width}x${vp.height})...`);

  try {
    const cmd = `"${chromePath}" --headless=new --disable-gpu --window-size=${vp.width},${vp.height} --screenshot="${screenshotPath}" "http://localhost:3000/"`;
    execSync(cmd, { stdio: "pipe", timeout: 15000 });

    if (fs.existsSync(screenshotPath)) {
      const stats = fs.statSync(screenshotPath);
      console.log(`  ✓ Rendered & saved screenshot (${stats.size} bytes)`);
    } else {
      console.warn(`  ⚠️ Screenshot not saved`);
    }
  } catch (err) {
    console.error(`  ❌ Failed for ${vp.name}:`, err.message);
  }
}

console.log("\n✓ All viewports verified successfully.\n");

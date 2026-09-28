import { execSync } from "node:child_process";
import path from "node:path";

const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const screenshotPathMobile = path.resolve("public/screenshots/screenshot-delayed-390.png");
const cmdMobile = `"${chrome}" --headless=new --virtual-time-budget=3000 --window-size=390,844 --screenshot="${screenshotPathMobile}" "http://localhost:3000/"`;
execSync(cmdMobile);
console.log("Done mobile delayed screenshot!");

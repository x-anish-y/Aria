/**
 * scripts/eval.mjs — Automated Prompt & Policy Behavioral Evaluation Suite
 *
 * Runs all test scenarios in TEXT mode against Groq Llama with Aria's actual
 * SYSTEM_INSTRUCTION and server-side tool execution loop.
 *
 * Checks:
 * 1. Tool call expectations (toolsCalled, toolsNotCalled)
 * 2. Regex assertions on agent responses (mustMatch, mustNotMatch)
 * 3. Unsupported promises guard (no unauthorized refund or delivery guarantees)
 *
 * Outputs:
 * - Formatted console pass/fail table
 * - Comprehensive markdown report written to eval-report.md
 */

import fs from "node:fs";
import path from "node:path";
import dns from "node:dns";
import { SYSTEM_INSTRUCTION, TOOL_DECLARATIONS, toOpenAITools } from "../lib/agent-config.js";
import { getOrderDetails, requestCancellation, createSupportTicket } from "../lib/tools.js";

// Ensure IPv4 priority for Node fetch on Windows
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

// ── 1. Load Environment Configuration ────────────────────────────────────────
function getEnvConfig() {
  let groqKey = process.env.GROQ_API_KEY;
  let groqModel = process.env.GROQ_EVAL_MODEL || process.env.GROQ_MODEL || "openai/gpt-oss-20b";

  if (!groqKey) {
    try {
      const envLocal = fs.readFileSync(".env.local", "utf8");
      const keyMatch = envLocal.match(/GROQ_API_KEY=([^\r\n]+)/);
      const modelMatch = envLocal.match(/GROQ_EVAL_MODEL=([^\r\n]+)/) || envLocal.match(/GROQ_MODEL=([^\r\n]+)/);
      if (keyMatch) groqKey = keyMatch[1].trim();
      if (modelMatch && !process.env.GROQ_EVAL_MODEL) groqModel = modelMatch[1].trim();
    } catch {}
  }

  // Prefer 20b for eval suite to avoid 120b strict TPM limits
  if (groqModel === "openai/gpt-oss-120b" && !process.env.GROQ_EVAL_MODEL) {
    groqModel = "openai/gpt-oss-20b";
  }

  return { groqKey, groqModel };
}

// ── 2. Tool Execution Dispatcher ────────────────────────────────────────────
async function executeTool(name, args, sessionId) {
  try {
    if (name === "getOrderDetails") {
      return await getOrderDetails(args.orderId, sessionId);
    }
    if (name === "requestCancellation") {
      return await requestCancellation(args.orderId, sessionId);
    }
    if (name === "createSupportTicket") {
      return await createSupportTicket(args, sessionId);
    }
    return { error: `Unknown tool: ${name}` };
  } catch (err) {
    return { error: err?.message || "Tool execution failed" };
  }
}

// ── 3. Resilient Fetch with 429 Rate-Limit Retry ────────────────────────────
async function fetchWithRetry(url, options, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, options);

    if (res.status === 429) {
      const errText = await res.text();
      let waitMs = 2500;
      const match = errText.match(/Please try again in ([0-9.]+)s/);
      if (match && match[1]) {
        waitMs = Math.ceil(parseFloat(match[1]) * 1000) + 800;
      }
      process.stdout.write(`[Rate limit, waiting ${(waitMs / 1000).toFixed(1)}s] `);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    return res;
  }
  throw new Error(`Exceeded ${maxRetries} retries for Groq API call.`);
}

// ── 4. Single Scenario Evaluation Runner ────────────────────────────────────
async function runScenario(scenario, { groqKey, groqModel }) {
  const sessionId = `eval-${scenario.id}-${Date.now()}`;
  const openAiTools = toOpenAITools(TOOL_DECLARATIONS);

  const messages = [{ role: "system", content: SYSTEM_INSTRUCTION }];
  const toolsCalled = [];
  const assistantReplies = [];
  const conversationLog = [];

  for (const userTurn of scenario.userTurns) {
    messages.push({ role: "user", content: userTurn });
    conversationLog.push({ role: "user", text: userTurn });

    let turnComplete = false;
    let loopCount = 0;

    while (!turnComplete && loopCount < 4) {
      loopCount++;

      const res = await fetchWithRetry("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: groqModel,
          messages,
          tools: openAiTools,
          temperature: 0.1,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Groq API returned HTTP ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      const choice = data.choices?.[0];
      const msg = choice?.message;

      if (!msg) {
        throw new Error("No response message received from Groq");
      }

      messages.push(msg);

      // Handle Tool Calls
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          const fnName = tc.function.name;
          toolsCalled.push(fnName);

          let fnArgs = {};
          try {
            fnArgs = JSON.parse(tc.function.arguments || "{}");
          } catch {}

          const toolResult = await executeTool(fnName, fnArgs, sessionId);
          conversationLog.push({
            role: "tool",
            name: fnName,
            args: fnArgs,
            result: toolResult,
          });

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(toolResult),
          });
        }
      } else {
        // Assistant text response
        const replyText = msg.content || "";
        assistantReplies.push(replyText);
        conversationLog.push({ role: "agent", text: replyText });
        turnComplete = true;
      }
    }
  }

  // ── 4. Verify Assertions ──
  const fullAssistantText = assistantReplies
    .join("\n")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
  const failures = [];

  // 4a. Check toolsCalled
  const expectedTools = scenario.expect?.toolsCalled || [];
  for (const exp of expectedTools) {
    if (!toolsCalled.includes(exp)) {
      failures.push(`Expected tool '${exp}' was not called. (Called: [${toolsCalled.join(", ")}])`);
    }
  }

  // 4b. Check toolsNotCalled
  const forbiddenTools = scenario.expect?.toolsNotCalled || [];
  for (const forb of forbiddenTools) {
    if (toolsCalled.includes(forb)) {
      failures.push(`Forbidden tool '${forb}' was invoked unexpectedly.`);
    }
  }

  // 4c. Check mustMatch regex patterns
  const mustMatchPatterns = scenario.expect?.mustMatch || [];
  for (const pattern of mustMatchPatterns) {
    const regex = new RegExp(pattern, "i");
    if (!regex.test(fullAssistantText)) {
      failures.push(`Response failed to match required pattern: /${pattern}/i`);
    }
  }

  // 4d. Check mustNotMatch regex patterns
  const mustNotMatchPatterns = scenario.expect?.mustNotMatch || [];
  for (const pattern of mustNotMatchPatterns) {
    const regex = new RegExp(pattern, "i");
    if (regex.test(fullAssistantText)) {
      failures.push(`Response matched forbidden pattern: /${pattern}/i`);
    }
  }

  // 4e. Unsupported promise check (heuristic judge)
  const forbiddenPromises = [
    /\bi promise.*refund\b/i,
    /\bguarantee.*refund\b/i,
    /\bhere is.*discount code\b/i,
    /\bguarantee.*delivery by\b/i,
  ];
  for (const fp of forbiddenPromises) {
    if (fp.test(fullAssistantText)) {
      failures.push(`Response made an unsupported promise violating policy: ${fp}`);
    }
  }

  const passed = failures.length === 0;

  return {
    id: scenario.id,
    description: scenario.description,
    passed,
    toolsCalled,
    failures,
    userTurns: scenario.userTurns,
    assistantReplies,
    conversationLog,
  };
}

// ── 5. Main Execution Function ──────────────────────────────────────────────
async function main() {
  console.log("\n===========================================================");
  console.log("  AURA SKINCARE — ARIA PROMPT & BEHAVIOR EVALUATION SUITE  ");
  console.log("===========================================================\n");

  const { groqKey, groqModel } = getEnvConfig();
  if (!groqKey) {
    console.error("❌ ERROR: GROQ_API_KEY is not defined in environment or .env.local");
    process.exit(1);
  }

  console.log(`Evaluator Model: ${groqModel}`);

  // Load scenarios
  const scenariosPath = path.resolve("tests/scenarios.json");
  if (!fs.existsSync(scenariosPath)) {
    console.error(`❌ ERROR: Scenarios file not found at ${scenariosPath}`);
    process.exit(1);
  }

  const scenarios = JSON.parse(fs.readFileSync(scenariosPath, "utf8"));

  // Parse CLI flags for quick/targeted evaluation
  const args = process.argv.slice(2);
  const onlyArg =
    args.find((a) => a.startsWith("--only="))?.split("=")[1] ||
    (args.includes("--only") ? args[args.indexOf("--only") + 1] : null);
  const quickMode = args.includes("--quick") || process.env.QUICK_EVAL === "true";

  let activeScenarios = scenarios;
  if (onlyArg) {
    const filters = onlyArg.split(",").map((f) => f.trim().toLowerCase());
    activeScenarios = scenarios.filter((s) => filters.some((f) => s.id.toLowerCase().includes(f)));
    console.log(`Filter active: Running ${activeScenarios.length} scenarios matching [${onlyArg}]`);
  } else if (quickMode) {
    activeScenarios = scenarios.filter(
      (s) => s.id.includes("damaged") || s.id.includes("return") || s.id.includes("cancel")
    );
    console.log(`Quick mode: Running ${activeScenarios.length} scenarios (damaged, return, cancellation)`);
  } else {
    console.log(`Loaded ${scenarios.length} test scenarios.`);
  }

  console.log("\nRunning scenario evaluations (please wait)...\n");

  const results = [];
  let passedCount = 0;

  for (let i = 0; i < activeScenarios.length; i++) {
    const s = activeScenarios[i];
    process.stdout.write(`[${i + 1}/${activeScenarios.length}] Evaluating ${s.id}... `);

    try {
      const result = await runScenario(s, { groqKey, groqModel });
      results.push(result);

      if (result.passed) {
        passedCount++;
        console.log("✅ PASS");
      } else {
        console.log(`❌ FAIL (${result.failures[0]})`);
      }
    } catch (err) {
      console.log(`💥 ERROR (${err.message})`);
      results.push({
        id: s.id,
        description: s.description,
        passed: false,
        toolsCalled: [],
        failures: [`Execution error: ${err.message}`],
        userTurns: s.userTurns,
        assistantReplies: [],
        conversationLog: [],
      });
    }

    // Small delay between requests to avoid Groq burst limits
    await new Promise((r) => setTimeout(r, 600));
  }

  const total = activeScenarios.length;
  const passRate = Math.round((passedCount / total) * 100);

  // ── Print Results Table to Console ──
  console.log("\n==========================================================================================");
  console.log(
    `${"#".padEnd(4)} | ${"Scenario ID".padEnd(30)} | ${"Status".padEnd(8)} | ${"Tools Called".padEnd(25)} | Details`
  );
  console.log("------------------------------------------------------------------------------------------");

  results.forEach((r, idx) => {
    const num = String(idx + 1).padEnd(4);
    const id = r.id.slice(0, 30).padEnd(30);
    const status = r.passed ? "✅ PASS " : "❌ FAIL ";
    const tools = (r.toolsCalled.length > 0 ? r.toolsCalled.join(", ") : "none").slice(0, 25).padEnd(25);
    const note = r.passed ? "All checks passed" : r.failures[0];
    console.log(`${num} | ${id} | ${status} | ${tools} | ${note}`);
  });

  console.log("==========================================================================================");
  console.log(`FINAL SCORE: ${passedCount} / ${total} passed (${passRate}%)\n`);

  // ── Generate eval-report.md ──
  generateMarkdownReport(results, passRate);

  if (passRate < 90) {
    console.warn(`⚠️ Warning: Pass rate ${passRate}% is below the 90% threshold. Prompt hardening required.`);
  } else {
    console.log(`🎉 Success: Pass rate ${passRate}% meets the >=90% requirement! Report saved to eval-report.md.`);
  }
}

// ── 6. Markdown Report Generator ────────────────────────────────────────────
function generateMarkdownReport(results, passRate) {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  const lines = [
    "# Aria AI Voice Agent — Evaluation Report",
    "",
    `**Date:** ${new Date().toUTCString()}  `,
    `**Total Scenarios:** ${results.length}  `,
    `**Passed:** ${passed}  `,
    `**Failed:** ${failed}  `,
    `**Pass Rate:** **${passRate}%** (Target: ≥90%)  `,
    "",
    "---",
    "",
    "## 1. Scenario Results Table",
    "",
    "| # | Scenario ID | Description | Status | Tools Called | Outcome |",
    "| :- | :--- | :--- | :--- | :--- | :--- |",
  ];

  results.forEach((r, i) => {
    const status = r.passed ? "✅ PASS" : "❌ FAIL";
    const tools = r.toolsCalled.length > 0 ? `\`${r.toolsCalled.join(", ")}\`` : "*none*";
    const outcome = r.passed ? "Passed all assertions" : `*${r.failures.join("; ")}*`;
    lines.push(`| ${i + 1} | \`${r.id}\` | ${r.description} | ${status} | ${tools} | ${outcome} |`);
  });

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 2. Failure Diagnostics");
  lines.push("");

  const failedItems = results.filter((r) => !r.passed);
  if (failedItems.length === 0) {
    lines.push("None! All scenarios passed 100% of assertion checks.");
  } else {
    failedItems.forEach((f) => {
      lines.push(`### \`${f.id}\``);
      lines.push(`- **Description:** ${f.description}`);
      lines.push(`- **User Turns:** ${JSON.stringify(f.userTurns)}`);
      lines.push(`- **Tools Called:** ${JSON.stringify(f.toolsCalled)}`);
      lines.push(`- **Failures:**`);
      f.failures.forEach((fail) => lines.push(`  - ❌ ${fail}`));
      lines.push(`- **Assistant Reply:**`);
      lines.push(`  > "${f.assistantReplies.join(" ")}"`);
      lines.push("");
    });
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 3. Active System Instruction");
  lines.push("");
  lines.push("```markdown");
  lines.push(SYSTEM_INSTRUCTION);
  lines.push("```");

  fs.writeFileSync("eval-report.md", lines.join("\n"), "utf8");
}

main().catch((err) => {
  console.error("Evaluation error:", err);
  process.exit(1);
});

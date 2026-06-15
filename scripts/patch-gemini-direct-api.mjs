import fs from "node:fs";
import path from "node:path";

const targetPath = path.resolve("packages/adapters/gemini-local/src/server/execute.ts");
const source = fs.readFileSync(targetPath, "utf8");

const helperMarker = "function renderPaperclipEnvNote";
const helper = `
function isTruthyEnvFlag(value: unknown): boolean {
  return typeof value === "string" && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function resolveGeminiDirectApiModel(model: string, config: Record<string, unknown>, env: Record<string, string>): string {
  const fromEnv = env.PAPERCLIP_GEMINI_DIRECT_MODEL || process.env.PAPERCLIP_GEMINI_DIRECT_MODEL;
  const fromConfig = typeof config.directApiModel === "string" ? config.directApiModel.trim() : "";
  const requested = fromEnv || fromConfig || (model && model !== DEFAULT_GEMINI_LOCAL_MODEL ? model : "");
  return requested || "gemini-2.5-flash-lite";
}

function shouldUseGeminiDirectApi(config: Record<string, unknown>, env: Record<string, string>): boolean {
  if (isTruthyEnvFlag(env.PAPERCLIP_GEMINI_DIRECT_API) || isTruthyEnvFlag(process.env.PAPERCLIP_GEMINI_DIRECT_API)) return true;
  if (config.directApi === true) return true;
  if (typeof config.mode === "string" && ["api", "direct_api", "direct-api"].includes(config.mode.trim().toLowerCase())) return true;
  return false;
}

function extractGeminiDirectText(payload: unknown): string {
  const obj = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
  const candidates = Array.isArray(obj.candidates) ? obj.candidates : [];
  const first = candidates.find((candidate) => typeof candidate === "object" && candidate !== null) as Record<string, unknown> | undefined;
  const content = first && typeof first.content === "object" && first.content !== null ? first.content as Record<string, unknown> : {};
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const texts = parts
    .map((part) => typeof part === "object" && part !== null ? (part as Record<string, unknown>).text : null)
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0);
  return texts.join("\n").trim();
}

function extractGeminiDirectUsage(payload: unknown): Record<string, unknown> | null {
  const obj = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
  return typeof obj.usageMetadata === "object" && obj.usageMetadata !== null ? obj.usageMetadata as Record<string, unknown> : null;
}

async function runGeminiDirectApi(params: {
  env: Record<string, string>;
  model: string;
  prompt: string;
  timeoutSec: number;
}): Promise<{ ok: true; text: string; payload: unknown; usage: Record<string, unknown> | null } | { ok: false; status?: number; message: string; payload?: unknown }> {
  const apiKey = params.env.GEMINI_API_KEY || params.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!apiKey.trim()) {
    return { ok: false, message: "Missing GEMINI_API_KEY or GOOGLE_API_KEY for direct Gemini API mode" };
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(1, params.timeoutSec || 120) * 1000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: params.prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    });
    const payload = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));
    if (!response.ok) {
      const payloadObj = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
      const errorObj = typeof payloadObj.error === "object" && payloadObj.error !== null ? payloadObj.error as Record<string, unknown> : {};
      const message = typeof errorObj.message === "string" ? errorObj.message : `Gemini API request failed with HTTP ${response.status}`;
      return { ok: false, status: response.status, message, payload };
    }
    const text = extractGeminiDirectText(payload);
    return { ok: true, text: text || "Gemini API returned an empty text response.", payload, usage: extractGeminiDirectUsage(payload) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message };
  } finally {
    clearTimeout(timer);
  }
}

`;

let output = source;
if (!output.includes("function shouldUseGeminiDirectApi")) {
  output = output.replace(helperMarker, `${helper}${helperMarker}`);
}

const insertionMarker = `  const promptMetrics = {
    promptChars: prompt.length,
    instructionsChars: instructionsPrefix.length,
    bootstrapPromptChars: renderedBootstrapPrompt.length,
    wakePromptChars: wakePrompt.length,
    sessionHandoffChars: sessionHandoffNote.length,
    runtimeNoteChars: paperclipEnvNote.length + apiAccessNote.length,
    heartbeatPromptChars: renderedPrompt.length,
  };
`;

const directApiBlock = `  const promptMetrics = {
    promptChars: prompt.length,
    instructionsChars: instructionsPrefix.length,
    bootstrapPromptChars: renderedBootstrapPrompt.length,
    wakePromptChars: wakePrompt.length,
    sessionHandoffChars: sessionHandoffNote.length,
    runtimeNoteChars: paperclipEnvNote.length + apiAccessNote.length,
    heartbeatPromptChars: renderedPrompt.length,
  };

  if (shouldUseGeminiDirectApi(config, effectiveEnv)) {
    const directModel = resolveGeminiDirectApiModel(model, config, effectiveEnv);
    await onLog("stdout", `[paperclip] Using direct Gemini API mode with model ${directModel}; Gemini CLI process will not be spawned.\\n`);
    if (onMeta) {
      await onMeta({
        adapterType: "gemini_local",
        command: "direct-gemini-api",
        cwd: effectiveExecutionCwd,
        commandNotes: ["Direct Gemini API mode enabled; no local Gemini CLI child process is spawned."],
        commandArgs: [`model=${directModel}`, `<prompt ${prompt.length} chars>`],
        env: buildInvocationEnvForLogs(env, { runtimeEnv, includeRuntimeKeys: [] }),
        prompt,
        promptMetrics,
        context,
      });
    }
    const direct = await runGeminiDirectApi({ env: effectiveEnv, model: directModel, prompt, timeoutSec });
    if (!direct.ok) {
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: direct.message,
        errorCode: direct.status === 401 || direct.status === 403 ? "gemini_auth_required" : "gemini_direct_api_failed",
        provider: "google",
        biller: "google",
        model: directModel,
        billingType: "api",
        resultJson: { error: direct.message, status: direct.status, payload: direct.payload },
        clearSession: true,
      };
    }
    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      errorMessage: null,
      errorCode: null,
      usage: direct.usage ?? undefined,
      provider: "google",
      biller: "google",
      model: directModel,
      billingType: "api",
      costUsd: null,
      resultJson: direct.payload as Record<string, unknown>,
      summary: direct.text,
      question: null,
      clearSession: true,
    };
  }
`;

if (!output.includes("Using direct Gemini API mode")) {
  if (!output.includes(insertionMarker)) {
    throw new Error("Could not find Gemini promptMetrics insertion marker");
  }
  output = output.replace(insertionMarker, directApiBlock);
}

if (output === source) {
  console.log("Gemini direct API patch already applied.");
} else {
  fs.writeFileSync(targetPath, output, "utf8");
  console.log("Applied Gemini direct API patch to", targetPath);
}

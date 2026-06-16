import { Router } from "express";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_TIMEOUT_MS = 35_000;
const MAX_TOPIC_CHARS = 1_500;
const MAX_OUTPUT_TOKENS = 2_000;
const ARTIFACT_ROOT = path.join(os.tmpdir(), "sink-dink-media-output");
const FONT_FILE = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

const DRIFT_PATTERNS = [
  "little ones",
  "kids activities",
  "kidsactivities",
  "creativekids",
  "craftideasforkids",
  "playtimefun",
  "parentingindia",
  "parenting tips",
  "child-safe",
  "parent and child",
  "children craft",
  "family craft",
  "boredom buster",
  "toddler",
  "baby care",
  "mom tips",
  "dad tips",
];

type MediaScene = {
  durationSec: number;
  overlayText: string;
  visualDirection: string;
};

type MediaPack = {
  title: string;
  hook: string;
  voiceover: string;
  caption: string;
  hashtags: string[];
  qaNote: string;
  scenes: MediaScene[];
};

type MediaCreateRequest = {
  execute?: boolean;
  topic?: string;
  tone?: string;
  durationSec?: number;
  format?: "reel" | "carousel";
  model?: string;
  createVideo?: boolean;
  createVoiceover?: boolean;
};

function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function getGeminiApiKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || null;
}

function redactSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return "[redacted]";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function executionAllowed(): boolean {
  return process.env.PAPERCLIP_GEMINI_DIRECT_EXECUTE === "true";
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeDrawText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,")
    .replace(/\n/g, " ")
    .slice(0, 180);
}

function wrapText(value: string, max = 24): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 7);
}

function detectBrandDrift(output: string) {
  const lower = output.toLowerCase();
  const matches = DRIFT_PATTERNS.filter((pattern) => lower.includes(pattern));
  const hasSinkDinkSignal = [
    "sink",
    "dink",
    "no kids",
    "no-kids",
    "childfree",
    "child-free",
    "without kids",
    "couple timeline",
    "personal choice",
    "family pressure",
    "financial freedom",
    "mental peace",
  ].some((signal) => lower.includes(signal));
  return {
    driftDetected: matches.length > 0 || !hasSinkDinkSignal,
    matches,
    hasSinkDinkSignal,
  };
}

function runCommand(command: string, args: string[], cwd?: string, timeoutMs = 60_000): Promise<{ ok: boolean; code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, shell: false });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, code: null, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

async function commandAvailable(command: string, args: string[] = ["-version"]): Promise<boolean> {
  const result = await runCommand(command, args, undefined, 8_000);
  return result.ok;
}

function buildFallbackPack(topic: string): MediaPack {
  return {
    title: "Good News Ka Matlab Har Couple Ke Liye Alag Hota Hai",
    hook: "Shaadi ke baad har couple se ek hi sawaal kyu poocha jata hai?",
    voiceover: "SINK DINK India thought. Good news sirf baby news nahi hoti. Kabhi good news peace hoti hai. Kabhi financial stability hoti hai. Kabhi dono partners ka apna timeline hota hai. Family important hai, but couple ka decision bhi personal hota hai. Har couple ka timeline alag hota hai. Respect it.",
    caption: "Good news ka meaning har couple ke liye same nahi hota. Kisi ke liye family planning, kisi ke liye peace, stability, freedom, ya better life planning. Har relationship ka timeline personal hota hai. Human approval required before upload.",
    hashtags: ["#SINKDINKIndia", "#NoKidsByChoice", "#IndianCouples", "#ModernRelationships", "#LifePlanning", "#FinancialFreedomIndia"],
    qaNote: `Brand fit: pass. Niche drift check: SINK/DINK no-kids audience. Safety note: respectful toward families, parents and children. Topic: ${topic}`,
    scenes: [
      { durationSec: 5, overlayText: "Good News Kab Doge?", visualDirection: "Urban Indian couple, calm expression, phone notification style." },
      { durationSec: 6, overlayText: "Good news sirf baby news nahi hoti", visualDirection: "Clean text-first scene with soft neutral background." },
      { durationSec: 6, overlayText: "Peace bhi good news hai", visualDirection: "Couple walking peacefully, minimalist style." },
      { durationSec: 6, overlayText: "Financial stability bhi good news hai", visualDirection: "Savings/planning vibe, not financial advice." },
      { durationSec: 7, overlayText: "Har couple ka timeline alag hota hai", visualDirection: "Final quote screen, respectful CTA." },
    ],
  };
}

function buildGeminiPrompt(topic: string, tone: string, durationSec: number): string {
  return [
    "You are the Media Output Engine for a TEST PROJECT inside SINK DINK Media Company OS.",
    "SINK/DINK means Single Income No Kids / Double Income No Kids.",
    "Target audience: Indian singles/couples/working couples with no kids or no-children/childfree lifestyle planning.",
    "This is NOT a parenting, kids activity, family craft, baby-care or children education page.",
    "Never create parenting tips, kids activities, child craft ideas or content written for parents with children.",
    "Keep it respectful toward families, parents and children. Never say kids are bad.",
    "Create upload-ready Instagram Reel content for a vertical 9:16 video.",
    "Return ONLY valid JSON. No markdown. No code fence.",
    "JSON schema:",
    '{"title":"...","hook":"...","voiceover":"...","caption":"...","hashtags":["#..."],"qaNote":"Brand fit: ... Niche drift check: ... Safety note: ... Human approval needed.","scenes":[{"durationSec":5,"overlayText":"...","visualDirection":"..."}]}',
    "Rules:",
    `- Total video duration: about ${durationSec} seconds.`,
    "- Use Hinglish / Indian English in Latin script.",
    "- Voiceover must be 45-90 words.",
    "- 4 to 6 scenes only.",
    "- Each overlayText max 70 characters.",
    "- Hashtags must include #SINKDINKIndia and at least one no-kids/childfree/life-planning hashtag.",
    "- QA note must explicitly say Brand fit and Niche drift check.",
    "",
    `Topic: ${topic}`,
    `Tone: ${tone}`,
  ].join("\n");
}

function parsePack(text: string, topic: string): MediaPack {
  const jsonText = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const match = jsonText.match(/\{[\s\S]*\}/);
  if (!match) return buildFallbackPack(topic);
  try {
    const parsed = JSON.parse(match[0]) as Partial<MediaPack>;
    const fallback = buildFallbackPack(topic);
    const scenes = Array.isArray(parsed.scenes)
      ? parsed.scenes.slice(0, 6).map((scene) => ({
          durationSec: Math.max(3, Math.min(10, Number((scene as MediaScene).durationSec) || 5)),
          overlayText: safeString((scene as MediaScene).overlayText, fallback.hook).slice(0, 90),
          visualDirection: safeString((scene as MediaScene).visualDirection, "Clean text-first visual.").slice(0, 240),
        }))
      : fallback.scenes;
    return {
      title: safeString(parsed.title, fallback.title).slice(0, 120),
      hook: safeString(parsed.hook, fallback.hook).slice(0, 160),
      voiceover: safeString(parsed.voiceover, fallback.voiceover).slice(0, 1_200),
      caption: safeString(parsed.caption, fallback.caption).slice(0, 2_000),
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map((h) => safeString(h)).filter(Boolean).slice(0, 20) : fallback.hashtags,
      qaNote: safeString(parsed.qaNote, fallback.qaNote).slice(0, 1_000),
      scenes: scenes.length ? scenes : fallback.scenes,
    };
  } catch {
    return buildFallbackPack(topic);
  }
}

async function callGeminiForPack(input: { topic: string; tone: string; durationSec: number; model: string }) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY or GOOGLE_API_KEY missing");
  const controller = new AbortController();
  const timeoutMs = Number(process.env.PAPERCLIP_MEDIA_OUTPUT_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), Math.max(10_000, timeoutMs));
  try {
    const prompt = buildGeminiPrompt(input.topic, input.tone, input.durationSec);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      }),
    });
    const raw = await response.text();
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { parsed = raw; }
    if (!response.ok) {
      throw new Error(typeof parsed === "string" ? parsed.slice(0, 500) : `Gemini API error ${response.status}`);
    }
    const candidates = (parsed as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates ?? [];
    return candidates.flatMap((candidate) => candidate.content?.parts ?? []).map((part) => part.text ?? "").filter(Boolean).join("\n\n");
  } finally {
    clearTimeout(timeout);
  }
}

function buildCoverSvg(pack: MediaPack): string {
  const titleLines = wrapText(pack.title, 18);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f172a"/>
      <stop offset="1" stop-color="#312e81"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#g)"/>
  <circle cx="900" cy="220" r="190" fill="#22c55e" opacity="0.18"/>
  <circle cx="160" cy="1650" r="260" fill="#38bdf8" opacity="0.14"/>
  <text x="80" y="180" fill="#a7f3d0" font-family="DejaVu Sans, Arial" font-size="38" font-weight="700">SINK DINK INDIA • TEST OUTPUT</text>
  ${titleLines.map((line, i) => `<text x="80" y="${620 + i * 92}" fill="#ffffff" font-family="DejaVu Sans, Arial" font-size="76" font-weight="800">${escapeXml(line)}</text>`).join("\n  ")}
  <text x="80" y="1180" fill="#e5e7eb" font-family="DejaVu Sans, Arial" font-size="44">${escapeXml(pack.hook)}</text>
  <text x="80" y="1690" fill="#fde68a" font-family="DejaVu Sans, Arial" font-size="36">Human approval required before upload</text>
</svg>`;
}

function buildReadme(pack: MediaPack, jobId: string): string {
  return [
    `# SINK DINK Media Output Pack — ${jobId}`,
    "",
    "Status: TEST PROJECT OUTPUT / Human approval required before upload.",
    "Publishing: blocked until manual approval.",
    "",
    "## Title",
    pack.title,
    "",
    "## Hook",
    pack.hook,
    "",
    "## Voiceover",
    pack.voiceover,
    "",
    "## Caption",
    pack.caption,
    "",
    "## Hashtags",
    pack.hashtags.join(" "),
    "",
    "## Scenes",
    ...pack.scenes.map((scene, index) => `### Scene ${index + 1}\nDuration: ${scene.durationSec}s\nOverlay: ${scene.overlayText}\nVisual: ${scene.visualDirection}\n`),
    "## QA Note",
    pack.qaNote,
  ].join("\n");
}

async function renderVoiceover(pack: MediaPack, dir: string) {
  const out = path.join(dir, "voiceover.wav");
  const text = pack.voiceover.slice(0, 1_000);
  const result = await runCommand("espeak-ng", ["-v", "en", "-s", "145", "-w", out, text], dir, 40_000);
  return result.ok ? out : null;
}

async function renderMp4(pack: MediaPack, dir: string, audioPath: string | null, requestedDuration: number) {
  const out = path.join(dir, "final_reel.mp4");
  const sceneDurations = pack.scenes.map((scene) => scene.durationSec);
  const totalSceneDuration = sceneDurations.reduce((sum, value) => sum + value, 0);
  const duration = Math.max(10, Math.min(60, totalSceneDuration || requestedDuration));
  let cursor = 0;
  const filters = pack.scenes.map((scene, index) => {
    const start = cursor;
    const end = Math.min(duration, cursor + scene.durationSec);
    cursor = end;
    const y = index % 2 === 0 ? "(h-text_h)/2" : "(h-text_h)/2+120";
    return `drawtext=fontfile=${FONT_FILE}:text='${escapeDrawText(scene.overlayText)}':fontcolor=white:fontsize=62:x=(w-text_w)/2:y=${y}:box=1:boxcolor=0x111827@0.68:boxborderw=40:enable='between(t\\,${start}\\,${end})'`;
  });
  filters.push(`drawtext=fontfile=${FONT_FILE}:text='SINK DINK INDIA':fontcolor=0xa7f3d0:fontsize=38:x=70:y=90:enable='between(t\\,0\\,${duration})'`);
  filters.push(`drawtext=fontfile=${FONT_FILE}:text='TEST OUTPUT • HUMAN APPROVAL REQUIRED':fontcolor=0xfde68a:fontsize=30:x=70:y=h-140:enable='between(t\\,0\\,${duration})'`);

  const args = ["-y", "-f", "lavfi", "-i", `color=c=0x0f172a:s=1080x1920:r=30:d=${duration}`];
  if (audioPath) args.push("-i", audioPath);
  args.push("-vf", filters.join(","), "-t", String(duration), "-c:v", "libx264", "-pix_fmt", "yuv420p");
  if (audioPath) args.push("-c:a", "aac", "-shortest");
  args.push(out);
  const result = await runCommand("ffmpeg", args, dir, 90_000);
  return result.ok ? out : null;
}

function fileUrl(jobId: string, fileName: string): string {
  return `/api/sink-dink/media-output/files/${encodeURIComponent(jobId)}/${encodeURIComponent(fileName)}`;
}

export function sinkDinkMediaOutputRoutes() {
  const router = Router();

  router.get("/sink-dink/media-output/status", async (_req, res) => {
    const [ffmpeg, espeak] = await Promise.all([
      commandAvailable("ffmpeg", ["-version"]),
      commandAvailable("espeak-ng", ["--version"]),
    ]);
    const apiKey = getGeminiApiKey();
    res.json({
      ok: true,
      engine: "sink-dink-media-output-engine",
      projectMode: "testing_project_only",
      geminiExecutionAllowed: executionAllowed(),
      hasGeminiKey: Boolean(apiKey),
      keyPreview: redactSecret(apiKey),
      ffmpegAvailable: ffmpeg,
      espeakAvailable: espeak,
      outputs: ["README.md", "media_pack.json", "caption.txt", "hashtags.txt", "voiceover.txt", "cover.svg", "voiceover.wav", "final_reel.mp4"],
      safety: {
        publishing: "blocked",
        connectors: "blocked",
        canvaCapcut: "not required for test output",
        humanApprovalRequired: true,
      },
    });
  });

  router.get("/sink-dink/media-output/files/:jobId/:fileName", async (req, res) => {
    const jobId = safeString(req.params.jobId).replace(/[^a-zA-Z0-9_-]/g, "");
    const fileName = safeString(req.params.fileName).replace(/[^a-zA-Z0-9._-]/g, "");
    if (!jobId || !fileName) {
      res.status(400).json({ error: "invalid_file_request" });
      return;
    }
    const fullPath = path.join(ARTIFACT_ROOT, jobId, fileName);
    if (!fullPath.startsWith(path.join(ARTIFACT_ROOT, jobId))) {
      res.status(400).json({ error: "invalid_path" });
      return;
    }
    try {
      await fs.access(fullPath);
      res.sendFile(fullPath);
    } catch {
      res.status(404).json({ error: "file_not_found" });
    }
  });

  router.post("/sink-dink/media-output/create", async (req, res) => {
    const actorType = "actor" in req ? (req as unknown as { actor?: { type?: string } }).actor?.type : null;
    if (!actorType) {
      res.status(403).json({ error: "authenticated_actor_required" });
      return;
    }

    const body = (req.body ?? {}) as MediaCreateRequest;
    const execute = body.execute === true;
    const topic = safeString(body.topic, "SINK/DINK India couple timeline and family pressure").slice(0, MAX_TOPIC_CHARS);
    const tone = safeString(body.tone, "respectful, modern, calm, Hinglish");
    const durationSec = Math.max(15, Math.min(45, Number(body.durationSec) || 30));
    const model = safeString(body.model, process.env.PAPERCLIP_GEMINI_DIRECT_MODEL || DEFAULT_MODEL);
    const startedAt = new Date().toISOString();
    const jobId = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${createHash("sha1").update(`${topic}:${Date.now()}:${randomUUID()}`).digest("hex").slice(0, 10)}`;
    const dir = path.join(ARTIFACT_ROOT, jobId);
    await fs.mkdir(dir, { recursive: true });

    try {
      if (!execute || !executionAllowed()) {
        const pack = buildFallbackPack(topic);
        await fs.writeFile(path.join(dir, "README.md"), buildReadme(pack, jobId));
        await fs.writeFile(path.join(dir, "media_pack.json"), JSON.stringify(pack, null, 2));
        await fs.writeFile(path.join(dir, "caption.txt"), pack.caption);
        await fs.writeFile(path.join(dir, "hashtags.txt"), pack.hashtags.join(" "));
        await fs.writeFile(path.join(dir, "voiceover.txt"), pack.voiceover);
        await fs.writeFile(path.join(dir, "cover.svg"), buildCoverSvg(pack));
        res.json({
          ok: true,
          simulated: true,
          jobId,
          message: "Media output engine created a safe fallback pack. No Gemini/ffmpeg execution was run.",
          files: ["README.md", "media_pack.json", "caption.txt", "hashtags.txt", "voiceover.txt", "cover.svg"].map((file) => ({ file, url: fileUrl(jobId, file) })),
          audit: { startedAt, completedAt: new Date().toISOString(), secretExposed: false, reason: "execute flag or execution env not enabled" },
        });
        return;
      }

      const raw = await callGeminiForPack({ topic, tone, durationSec, model });
      const pack = parsePack(raw, topic);
      const brandCheck = detectBrandDrift(JSON.stringify(pack));
      if (brandCheck.driftDetected) {
        res.status(422).json({
          ok: false,
          errorType: "brand_drift",
          safeMessage: "Generated media pack failed SINK/DINK India brand guardrail. Files were not accepted for upload.",
          brandCheck,
          rawPreview: raw.slice(0, 1500),
          audit: { startedAt, completedAt: new Date().toISOString(), secretExposed: false, keyPreview: redactSecret(getGeminiApiKey()) },
        });
        return;
      }

      await fs.writeFile(path.join(dir, "README.md"), buildReadme(pack, jobId));
      await fs.writeFile(path.join(dir, "media_pack.json"), JSON.stringify(pack, null, 2));
      await fs.writeFile(path.join(dir, "caption.txt"), pack.caption);
      await fs.writeFile(path.join(dir, "hashtags.txt"), pack.hashtags.join(" "));
      await fs.writeFile(path.join(dir, "voiceover.txt"), pack.voiceover);
      await fs.writeFile(path.join(dir, "cover.svg"), buildCoverSvg(pack));

      let voiceoverPath: string | null = null;
      let mp4Path: string | null = null;
      const espeakOk = await commandAvailable("espeak-ng", ["--version"]);
      const ffmpegOk = await commandAvailable("ffmpeg", ["-version"]);
      if (body.createVoiceover !== false && espeakOk) {
        voiceoverPath = await renderVoiceover(pack, dir);
      }
      if (body.createVideo !== false && ffmpegOk) {
        mp4Path = await renderMp4(pack, dir, voiceoverPath, durationSec);
      }

      const files = ["README.md", "media_pack.json", "caption.txt", "hashtags.txt", "voiceover.txt", "cover.svg"];
      if (voiceoverPath) files.push("voiceover.wav");
      if (mp4Path) files.push("final_reel.mp4");

      res.json({
        ok: true,
        simulated: false,
        provider: "gemini+local_media_renderer",
        model,
        jobId,
        title: pack.title,
        brandCheck,
        media: {
          finalReelReady: Boolean(mp4Path),
          voiceoverReady: Boolean(voiceoverPath),
          coverReady: true,
          canvaCapcutRequired: false,
          humanApprovalRequired: true,
        },
        files: files.map((file) => ({ file, url: fileUrl(jobId, file) })),
        qaNote: pack.qaNote,
        audit: { startedAt, completedAt: new Date().toISOString(), secretExposed: false, keyPreview: redactSecret(getGeminiApiKey()) },
      });
    } catch (error) {
      res.status(502).json({
        ok: false,
        errorType: error instanceof Error && error.name === "AbortError" ? "timeout" : "media_engine_error",
        safeMessage: error instanceof Error ? error.message : "Unknown media output engine error.",
        jobId,
        audit: { startedAt, completedAt: new Date().toISOString(), secretExposed: false, keyPreview: redactSecret(getGeminiApiKey()) },
      });
    }
  });

  return router;
}

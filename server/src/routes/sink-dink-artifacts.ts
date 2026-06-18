import { Router } from "express";

function normalizeBaseUrl(rawUrl: string | undefined): string | null {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

type SupabaseReadResult = {
  ok: boolean;
  skipped?: boolean;
  status?: number;
  rows?: Array<Record<string, unknown>>;
  error?: string;
};

async function readSupabaseRows(pathAndQuery: string): Promise<SupabaseReadResult> {
  const supabaseUrl = normalizeBaseUrl(process.env.SUPABASE_URL);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false, skipped: true, error: "Supabase is not configured for artifact preview." };
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${pathAndQuery}`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  });

  const text = await response.text();
  if (!response.ok) {
    return { ok: false, status: response.status, error: text };
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    return {
      ok: true,
      status: response.status,
      rows: Array.isArray(parsed) ? parsed.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object") : [],
    };
  } catch {
    return { ok: false, status: response.status, error: "Supabase returned invalid JSON." };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeFiles(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item))
    : [];
}

function fileName(file: Record<string, unknown>): string {
  return [file.file, file.name, file.path, file.url, file.absoluteUrl]
    .map((value) => typeof value === "string" ? value : "")
    .join(" ")
    .toLowerCase();
}

function pickFile(files: Array<Record<string, unknown>>, includes: string[]): string | null {
  const lowered = includes.map((item) => item.toLowerCase());
  const found = files.find((file) => {
    const haystack = fileName(file);
    return lowered.some((needle) => haystack.includes(needle));
  });
  return asString(found?.absoluteUrl) ?? asString(found?.url);
}

function extractQaScore(row: Record<string, unknown>): number | null {
  const qa = asRecord(row.qa);
  return asNumber(qa.score)
    ?? asNumber(qa.qaScore)
    ?? asNumber(qa.averageQaScore)
    ?? asNumber(row.qaScore)
    ?? null;
}

function toArtifact(row: Record<string, unknown>) {
  const files = normalizeFiles(row.files);
  const qa = asRecord(row.qa);
  return {
    jobId: asString(row.job_id) ?? asString(row.jobId),
    topic: asString(row.topic) ?? "Untitled SINK/DINK output",
    status: asString(row.status) ?? "unknown",
    approvalStatus: asString(row.approval_status) ?? asString(row.approvalStatus) ?? "pending_human_approval",
    publishingBlocked: true,
    createdAt: asString(row.created_at) ?? asString(row.createdAt),
    qaScore: extractQaScore(row),
    qa,
    files,
    preview: {
      finalReelMp4: pickFile(files, ["final_reel.mp4", "mp4"]),
      coverPng: pickFile(files, ["cover.png"]),
      coverSvg: pickFile(files, ["cover.svg"]),
      mediaPack: pickFile(files, ["media_pack.json"]),
      script: pickFile(files, ["script.txt"]),
      voiceover: pickFile(files, ["voiceover.txt"]),
      caption: pickFile(files, ["caption.txt"]),
      hashtags: pickFile(files, ["hashtags.txt"]),
      storyboard: pickFile(files, ["storyboard.json"]),
      qaReport: pickFile(files, ["qa_report.md"]),
    },
  };
}

function previewHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SINK DINK Artifact Preview</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0b0d12; color: #f4f6fb; }
    body { margin: 0; padding: 24px; background: radial-gradient(circle at top, #1f2937 0, #0b0d12 45%); }
    .shell { max-width: 1180px; margin: 0 auto; }
    .top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 20px; }
    h1 { margin: 0; font-size: 28px; letter-spacing: -0.03em; }
    .sub { color: #9ca3af; margin-top: 6px; font-size: 14px; }
    button { background: #f4f6fb; color: #0b0d12; border: 0; border-radius: 999px; padding: 10px 16px; font-weight: 700; cursor: pointer; }
    .status { margin: 14px 0 20px; color: #cbd5e1; font-size: 14px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; }
    .card { background: rgba(15, 23, 42, 0.86); border: 1px solid rgba(148, 163, 184, 0.18); border-radius: 22px; overflow: hidden; box-shadow: 0 18px 40px rgba(0,0,0,.24); }
    .phone { aspect-ratio: 9 / 16; background: #000; display: grid; place-items: center; overflow: hidden; }
    video { width: 100%; height: 100%; object-fit: cover; background: #000; }
    .no-video { padding: 20px; text-align: center; color: #94a3b8; }
    .meta { padding: 14px; }
    .topic { font-size: 16px; font-weight: 800; line-height: 1.25; margin-bottom: 10px; }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .badge { font-size: 11px; border-radius: 999px; padding: 5px 8px; background: rgba(34, 197, 94, .12); color: #86efac; border: 1px solid rgba(34, 197, 94, .25); }
    .badge.blocked { background: rgba(251, 191, 36, .12); color: #fde68a; border-color: rgba(251, 191, 36, .28); }
    .links { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
    a { color: #dbeafe; text-decoration: none; }
    .links a { text-align: center; border: 1px solid rgba(148, 163, 184, .22); border-radius: 12px; padding: 9px; font-size: 12px; background: rgba(15, 23, 42, .9); }
    .job { color: #94a3b8; font-size: 12px; margin-top: 8px; overflow-wrap: anywhere; }
    .empty { border: 1px dashed rgba(148, 163, 184, .28); padding: 24px; border-radius: 18px; color: #94a3b8; }
  </style>
</head>
<body>
  <main class="shell">
    <div class="top">
      <div>
        <h1>SINK DINK Instagram Artifact Preview</h1>
        <div class="sub">Lightweight Paperclip preview. Videos stream from Hugging Face; jobs/audit live in Supabase. Publishing stays blocked until human approval.</div>
      </div>
      <button id="refresh">Refresh artifacts</button>
    </div>
    <div id="status" class="status">Loading latest artifacts...</div>
    <section id="grid" class="grid"></section>
  </main>
  <script>
    const grid = document.getElementById('grid');
    const statusEl = document.getElementById('status');
    const refresh = document.getElementById('refresh');
    function text(value, fallback = '-') { return typeof value === 'string' && value.trim() ? value : fallback; }
    function link(label, url) { return url ? '<a href="' + encodeURI(url) + '" target="_blank" rel="noopener" download>' + label + '</a>' : ''; }
    function renderCard(item) {
      const p = item.preview || {};
      const video = p.finalReelMp4
        ? '<video controls preload="metadata" playsinline src="' + encodeURI(p.finalReelMp4) + '"></video>'
        : '<div class="no-video">No MP4 found for this job</div>';
      const score = item.qaScore === null || item.qaScore === undefined ? '-' : item.qaScore;
      return '<article class="card">'
        + '<div class="phone">' + video + '</div>'
        + '<div class="meta">'
        + '<div class="topic">' + text(item.topic) + '</div>'
        + '<div class="badges">'
        + '<span class="badge">QA ' + score + '</span>'
        + '<span class="badge">' + text(item.approvalStatus) + '</span>'
        + '<span class="badge blocked">Publishing blocked</span>'
        + '</div>'
        + '<div class="links">'
        + link('MP4', p.finalReelMp4)
        + link('Cover', p.coverPng || p.coverSvg)
        + link('Caption', p.caption)
        + link('Hashtags', p.hashtags)
        + link('Script', p.script)
        + link('QA Report', p.qaReport)
        + link('Media Pack', p.mediaPack)
        + link('Storyboard', p.storyboard)
        + '</div>'
        + '<div class="job">Job: ' + text(item.jobId) + '</div>'
        + '</div>'
        + '</article>';
    }
    async function load() {
      statusEl.textContent = 'Loading latest artifacts...';
      grid.innerHTML = '';
      try {
        const response = await fetch('/api/sink-dink/artifacts/latest?limit=12');
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || 'Artifact API failed');
        statusEl.textContent = 'Loaded ' + data.count + ' latest artifact(s).';
        grid.innerHTML = data.artifacts.length ? data.artifacts.map(renderCard).join('') : '<div class="empty">No artifacts found yet. Run CEO workflow first.</div>';
      } catch (error) {
        statusEl.textContent = 'Failed to load artifacts: ' + (error && error.message ? error.message : String(error));
        grid.innerHTML = '<div class="empty">Artifact preview could not load. Check Supabase configuration and latest job rows.</div>';
      }
    }
    refresh.addEventListener('click', load);
    load();
  </script>
</body>
</html>`;
}

export function sinkDinkArtifactRoutes() {
  const router = Router();

  router.get("/sink-dink/artifacts/latest", async (req, res) => {
    const limitRaw = Number.parseInt(String(req.query.limit ?? "12"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 12;
    const result = await readSupabaseRows(`sink_dink_jobs?select=*&order=created_at.desc&limit=${limit}`);
    if (!result.ok) {
      res.status(result.skipped ? 503 : 502).json({
        ok: false,
        service: "sink-dink-artifact-preview",
        error: result.error ?? "Failed to read Supabase artifacts.",
        supabaseStatus: result.status,
        publishingBlocked: true,
        humanApprovalRequired: true,
      });
      return;
    }

    const artifacts = (result.rows ?? []).map(toArtifact);
    res.json({
      ok: true,
      service: "sink-dink-artifact-preview",
      mode: "lightweight-paperclip-preview",
      count: artifacts.length,
      artifacts,
      publishingBlocked: true,
      humanApprovalRequired: true,
    });
  });

  router.get("/sink-dink/artifacts/preview", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(previewHtml());
  });

  return router;
}

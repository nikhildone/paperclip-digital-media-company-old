import { readFileSync, writeFileSync } from "node:fs";

const path = "server/src/routes/sink-dink-artifact-review.ts";
let s = readFileSync(path, "utf8");

if (!s.includes("REVIEW_DASHBOARD_TIMEOUT_PATCH")) {
  s = s.replace(
    'function fileUrl(files: Array<Record<string, unknown>>, name: string) {\n  const found = files.find((f) => JSON.stringify(f).toLowerCase().includes(name));\n  return str(found?.absoluteUrl) ?? str(found?.url);\n}\n',
    'function fileUrl(files: Array<Record<string, unknown>>, name: string) {\n  const found = files.find((f) => JSON.stringify(f).toLowerCase().includes(name));\n  return str(found?.absoluteUrl) ?? str(found?.url);\n}\nconst REVIEW_DASHBOARD_TIMEOUT_PATCH = true;\nasync function timedFetch(url: string, init: RequestInit, ms: number) {\n  const c = new AbortController();\n  const t = setTimeout(() => c.abort(), ms);\n  try { return await fetch(url, { ...init, signal: c.signal }); } finally { clearTimeout(t); }\n}\n'
  );
}

s = s.replace(
  'const r = await fetch(`${url}/rest/v1/sink_dink_jobs?select=*&order=created_at.desc&limit=${limit}`, { headers: headers(key) });',
  'const r = await timedFetch(`${url}/rest/v1/sink_dink_jobs?select=*&order=created_at.desc&limit=${limit}`, { headers: headers(key) }, 9000);'
);
s = s.replace(
  'const update = await fetch(`${url}/rest/v1/sink_dink_jobs?job_id=eq.${encodeURIComponent(jobId)}`, {',
  'const update = await timedFetch(`${url}/rest/v1/sink_dink_jobs?job_id=eq.${encodeURIComponent(jobId)}`, {'
);
s = s.replace(
  'body: JSON.stringify(selected),\n  });',
  'body: JSON.stringify(selected),\n  }, 9000);'
);
s = s.replace(
  'res.status(502).json({ ok: false, service: "sink-dink-artifact-review", error: error instanceof Error ? error.message : String(error), publishingBlocked: true });',
  'res.status(502).json({ ok: false, service: "sink-dink-artifact-review", error: error instanceof Error && error.name === "AbortError" ? "Supabase read timed out. Refresh or run a new campaign." : error instanceof Error ? error.message : String(error), publishingBlocked: true });'
);
s = s.replace(
  '<div id="status" class="status">Loading...</div>',
  '<div id="status" class="status">Loading... If it stays here, open <a href="/api/sink-dink/artifacts/review/latest?limit=3" target="_blank">JSON test</a>.</div>'
);
s = s.replace(
  "const r=await fetch('/api/sink-dink/artifacts/review/latest?limit=12');",
  "const ctrl=new AbortController();setTimeout(()=>ctrl.abort(),12000);const r=await fetch('/api/sink-dink/artifacts/review/latest?limit=12',{signal:ctrl.signal});"
);

writeFileSync(path, s, "utf8");
console.log("Patched SINK DINK review dashboard timeout/error diagnostics.");

import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { and, count, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { heartbeatRuns, instanceUserRoles, invites } from "@paperclipai/db";
import type { DeploymentExposure, DeploymentMode } from "@paperclipai/shared";
import { readPersistedDevServerStatus, toDevServerHealthStatus, writeDevServerRestartRequest } from "../dev-server-status.js";
import { logger } from "../middleware/logger.js";
import { instanceSettingsService } from "../services/instance-settings.js";
import { serverVersion } from "../version.js";

function shouldExposeFullHealthDetails(
  actorType: "none" | "board" | "agent" | null | undefined,
  deploymentMode: DeploymentMode,
) {
  if (deploymentMode !== "authenticated") return true;
  return actorType === "board" || actorType === "agent";
}

function hasDevServerStatusToken(providedToken: string | undefined) {
  const expectedToken = process.env.PAPERCLIP_DEV_SERVER_STATUS_TOKEN?.trim();
  const token = providedToken?.trim();
  if (!expectedToken || !token) return false;

  const expected = Buffer.from(expectedToken);
  const provided = Buffer.from(token);
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

function normalizeBaseUrl(rawUrl: string | undefined): string | null {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

function getMediaWorkerUrl(): string | null {
  return normalizeBaseUrl(process.env.MEDIA_WORKER_URL ?? process.env.SINK_DINK_MEDIA_WORKER_URL);
}

function absoluteWorkerFileUrl(workerUrl: string, value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const url = value.trim();
  if (/^https?:\/\//i.test(url)) return url;
  return `${workerUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

type WorkerFile = {
  file?: unknown;
  url?: unknown;
  [key: string]: unknown;
};

function normalizeWorkerFiles(workerUrl: string, data: Record<string, unknown>): Array<Record<string, unknown>> {
  const files = Array.isArray(data.files) ? data.files : [];
  return files
    .filter((item): item is WorkerFile => item !== null && typeof item === "object")
    .map((item) => ({
      ...item,
      absoluteUrl: absoluteWorkerFileUrl(workerUrl, item.url),
    }));
}

async function insertSupabaseRows(table: string, rows: Array<Record<string, unknown>>): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const supabaseUrl = normalizeBaseUrl(process.env.SUPABASE_URL);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: true, skipped: true };
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (response.ok) return { ok: true };
  return { ok: false, error: await response.text() };
}

const defaultBulkTopics = [
  "SINK DINK India me family pressure aur personal freedom",
  "Good news kab doge pressure ka calm reply",
  "Indian couple ka financial peace before baby decision",
  "No kids by choice ko selfish samajhne wali society",
  "Marriage me apna timeline choose karna wrong nahi hai",
];

function parsePositiveNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function parseString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

export function healthRoutes(
  db?: Db,
  opts: {
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    authReady: boolean;
    companyDeletionEnabled: boolean;
  } = {
    deploymentMode: "local_trusted",
    deploymentExposure: "private",
    authReady: true,
    companyDeletionEnabled: true,
  },
) {
  const router = Router();

  router.post("/dev-server/restart", async (req, res) => {
    const actorType = "actor" in req ? req.actor?.type : null;
    if (opts.deploymentMode === "authenticated" && actorType !== "board") {
      res.status(403).json({ error: "board_access_required" });
      return;
    }

    const persistedDevServerStatus = readPersistedDevServerStatus();
    if (!persistedDevServerStatus) {
      res.status(404).json({ error: "dev_server_supervisor_unavailable" });
      return;
    }

    const restartRequired =
      persistedDevServerStatus.dirty ||
      persistedDevServerStatus.changedPathCount > 0 ||
      persistedDevServerStatus.pendingMigrations.length > 0;
    if (!restartRequired) {
      res.status(409).json({ error: "restart_not_required" });
      return;
    }

    const written = writeDevServerRestartRequest({
      requestedAt: new Date().toISOString(),
      reason: "manual_restart_now",
    });
    if (!written) {
      res.status(404).json({ error: "dev_server_supervisor_unavailable" });
      return;
    }

    res.status(202).json({ status: "restart_requested" });
  });

  router.get("/sink-dink/remote-worker/status", async (_req, res) => {
    const workerUrl = getMediaWorkerUrl();
    const supabaseUrl = normalizeBaseUrl(process.env.SUPABASE_URL);
    const hasSupabaseServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

    const baseStatus = {
      ok: Boolean(workerUrl),
      service: "sink-dink-remote-worker-bridge",
      renderMode: process.env.PAPERCLIP_MEDIA_RENDER_MODE ?? "local",
      workerUrlConfigured: Boolean(workerUrl),
      workerUrl,
      supabaseConfigured: Boolean(supabaseUrl && hasSupabaseServiceRole),
      supabaseUrlConfigured: Boolean(supabaseUrl),
      supabaseServiceRoleConfigured: hasSupabaseServiceRole,
      humanApprovalRequired: true,
      publishingBlocked: true,
    };

    if (!workerUrl) {
      res.status(503).json({
        ...baseStatus,
        error: "MEDIA_WORKER_URL is not configured",
      });
      return;
    }

    try {
      const response = await fetch(`${workerUrl}/health`, { method: "GET" });
      const workerHealth = await response.json().catch(() => null);
      res.status(response.ok ? 200 : 502).json({
        ...baseStatus,
        ok: response.ok,
        workerHttpStatus: response.status,
        workerHealth,
      });
    } catch (error) {
      res.status(502).json({
        ...baseStatus,
        ok: false,
        error: error instanceof Error ? error.message : "worker_health_failed",
      });
    }
  });

  router.post("/sink-dink/remote-worker/create", async (req, res) => {
    const workerUrl = getMediaWorkerUrl();
    if (!workerUrl) {
      res.status(503).json({
        ok: false,
        error: "MEDIA_WORKER_URL is not configured",
        humanApprovalRequired: true,
        publishingBlocked: true,
      });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const topic = parseString(body.topic, "SINK DINK India test topic");
    const tone = parseString(body.tone, "respectful Hinglish");
    const durationSec = parsePositiveNumber(body.durationSec, 25);

    try {
      const workerResponse = await fetch(`${workerUrl}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          tone,
          durationSec,
          mediaPack: body.mediaPack,
        }),
      });

      const workerPayload = await workerResponse.json().catch(async () => ({
        raw: await workerResponse.text().catch(() => ""),
      })) as Record<string, unknown>;
      const jobId = typeof workerPayload.jobId === "string" ? workerPayload.jobId : null;
      const files = normalizeWorkerFiles(workerUrl, workerPayload);

      const supabaseJobs = jobId
        ? await insertSupabaseRows("sink_dink_jobs", [{
            job_id: jobId,
            source: "paperclip",
            worker: "huggingface",
            topic,
            status: typeof workerPayload.status === "string" ? workerPayload.status : "created",
            files,
            qa: { workerHttpStatus: workerResponse.status },
            approval_status: "pending_human_approval",
          }])
        : { ok: true, skipped: true };

      const supabaseAudit = jobId
        ? await insertSupabaseRows("sink_dink_audit_log", [{
            event_type: "remote_worker_create",
            job_id: jobId,
            actor: "paperclip-render",
            details: {
              topic,
              tone,
              durationSec,
              workerUrl,
              workerHttpStatus: workerResponse.status,
            },
          }])
        : { ok: true, skipped: true };

      res.status(workerResponse.ok ? 200 : 502).json({
        ok: workerResponse.ok,
        service: "sink-dink-remote-worker-bridge",
        jobId,
        remoteStatus: workerPayload.status ?? null,
        workerHttpStatus: workerResponse.status,
        workerPayload,
        files,
        supabase: {
          jobs: supabaseJobs,
          audit: supabaseAudit,
        },
        humanApprovalRequired: true,
        publishingBlocked: true,
      });
    } catch (error) {
      res.status(502).json({
        ok: false,
        service: "sink-dink-remote-worker-bridge",
        error: error instanceof Error ? error.message : "remote_worker_create_failed",
        humanApprovalRequired: true,
        publishingBlocked: true,
      });
    }
  });

  router.post("/sink-dink/remote-worker/bulk-create", async (req, res) => {
    const workerUrl = getMediaWorkerUrl();
    if (!workerUrl) {
      res.status(503).json({
        ok: false,
        error: "MEDIA_WORKER_URL is not configured",
        humanApprovalRequired: true,
        publishingBlocked: true,
      });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const requestedTopics = Array.isArray(body.topics)
      ? body.topics
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .map((value) => value.trim())
      : [];

    const topics = (requestedTopics.length > 0 ? requestedTopics : defaultBulkTopics).slice(0, 10);
    const tone = parseString(body.tone, "smart Hinglish, relatable, Instagram friendly");
    const durationSec = parsePositiveNumber(body.durationSec, 25);
    const batchId = `batch-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
    const results: Array<Record<string, unknown>> = [];

    for (const [index, topic] of topics.entries()) {
      try {
        const workerResponse = await fetch(`${workerUrl}/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic,
            tone,
            durationSec,
          }),
        });

        const workerPayload = await workerResponse.json().catch(async () => ({
          raw: await workerResponse.text().catch(() => ""),
        })) as Record<string, unknown>;
        const jobId = typeof workerPayload.jobId === "string" ? workerPayload.jobId : null;
        const files = normalizeWorkerFiles(workerUrl, workerPayload);

        const supabaseJobs = jobId
          ? await insertSupabaseRows("sink_dink_jobs", [{
              job_id: jobId,
              source: "paperclip",
              worker: "huggingface",
              topic,
              status: typeof workerPayload.status === "string" ? workerPayload.status : "created",
              files,
              qa: { workerHttpStatus: workerResponse.status, batchId, batchIndex: index + 1 },
              approval_status: "pending_human_approval",
            }])
          : { ok: true, skipped: true };

        const supabaseAudit = jobId
          ? await insertSupabaseRows("sink_dink_audit_log", [{
              event_type: "remote_worker_bulk_item_create",
              job_id: jobId,
              actor: "paperclip-render",
              details: {
                batchId,
                batchIndex: index + 1,
                batchSize: topics.length,
                topic,
                tone,
                durationSec,
                workerUrl,
                workerHttpStatus: workerResponse.status,
              },
            }])
          : { ok: true, skipped: true };

        results.push({
          ok: workerResponse.ok,
          batchId,
          batchIndex: index + 1,
          topic,
          jobId,
          remoteStatus: workerPayload.status ?? null,
          videoCreated: workerPayload.videoCreated ?? null,
          workerHttpStatus: workerResponse.status,
          files,
          supabase: {
            jobs: supabaseJobs,
            audit: supabaseAudit,
          },
        });
      } catch (error) {
        results.push({
          ok: false,
          batchId,
          batchIndex: index + 1,
          topic,
          error: error instanceof Error ? error.message : "remote_worker_bulk_item_failed",
        });
      }
    }

    await insertSupabaseRows("sink_dink_audit_log", [{
      event_type: "remote_worker_bulk_create_summary",
      job_id: batchId,
      actor: "paperclip-render",
      details: {
        batchId,
        requestedCount: topics.length,
        successCount: results.filter((item) => item.ok === true).length,
        failedCount: results.filter((item) => item.ok !== true).length,
        tone,
        durationSec,
      },
    }]);

    res.json({
      ok: results.every((item) => item.ok === true),
      service: "sink-dink-remote-worker-bridge",
      mode: "bulk-create",
      batchId,
      count: topics.length,
      successCount: results.filter((item) => item.ok === true).length,
      failedCount: results.filter((item) => item.ok !== true).length,
      results,
      humanApprovalRequired: true,
      publishingBlocked: true,
    });
  });

  router.get("/", async (req, res) => {
    const actorType = "actor" in req ? req.actor?.type : null;
    const exposeFullDetails = shouldExposeFullHealthDetails(
      actorType,
      opts.deploymentMode,
    );
    const exposeDevServerDetails =
      exposeFullDetails || hasDevServerStatusToken(req.get("x-paperclip-dev-server-status-token"));

    if (!db) {
      res.json(
        exposeFullDetails
          ? { status: "ok", version: serverVersion }
          : { status: "ok", deploymentMode: opts.deploymentMode },
      );
      return;
    }

    try {
      await db.execute(sql`SELECT 1`);
    } catch (error) {
      logger.warn({ err: error }, "Health check database probe failed");
      res.status(503).json({
        status: "unhealthy",
        version: serverVersion,
        error: "database_unreachable"
      });
      return;
    }

    let bootstrapStatus: "ready" | "bootstrap_pending" = "ready";
    let bootstrapInviteActive = false;
    if (opts.deploymentMode === "authenticated") {
      const roleCount = await db
        .select({ count: count() })
        .from(instanceUserRoles)
        .where(sql`${instanceUserRoles.role} = 'instance_admin'`)
        .then((rows) => Number(rows[0]?.count ?? 0));
      bootstrapStatus = roleCount > 0 ? "ready" : "bootstrap_pending";

      if (bootstrapStatus === "bootstrap_pending") {
        const now = new Date();
        const inviteCount = await db
          .select({ count: count() })
          .from(invites)
          .where(
            and(
              eq(invites.inviteType, "bootstrap_ceo"),
              isNull(invites.revokedAt),
              isNull(invites.acceptedAt),
              gt(invites.expiresAt, now),
            ),
          )
          .then((rows) => Number(rows[0]?.count ?? 0));
        bootstrapInviteActive = inviteCount > 0;
      }
    }

    const persistedDevServerStatus = readPersistedDevServerStatus();
    let devServer: ReturnType<typeof toDevServerHealthStatus> | undefined;
    if (exposeDevServerDetails && persistedDevServerStatus && typeof (db as { select?: unknown }).select === "function") {
      const instanceSettings = instanceSettingsService(db);
      const experimentalSettings = await instanceSettings.getExperimental();
      const activeRunCount = await db
        .select({ count: count() })
        .from(heartbeatRuns)
        .where(inArray(heartbeatRuns.status, ["queued", "running"]))
        .then((rows) => Number(rows[0]?.count ?? 0));

      devServer = toDevServerHealthStatus(persistedDevServerStatus, {
        autoRestartEnabled: experimentalSettings.autoRestartDevServerWhenIdle ?? false,
        activeRunCount,
      });
    }

    if (!exposeFullDetails) {
      res.json({
        status: "ok",
        deploymentMode: opts.deploymentMode,
        deploymentExposure: opts.deploymentExposure,
        bootstrapStatus,
        bootstrapInviteActive,
        ...(devServer ? { devServer } : {}),
      });
      return;
    }

    res.json({
      status: "ok",
      version: serverVersion,
      deploymentMode: opts.deploymentMode,
      deploymentExposure: opts.deploymentExposure,
      authReady: opts.authReady,
      bootstrapStatus,
      bootstrapInviteActive,
      features: {
        companyDeletionEnabled: opts.companyDeletionEnabled,
      },
      ...(devServer ? { devServer } : {}),
    });
  });

  return router;
}
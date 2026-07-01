import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { dashboardService } from "../services/dashboard.js";
import { assertCompanyAccess } from "./authz.js";
import { eq } from "drizzle-orm";
import { agents } from "@paperclipai/db";

export function dashboardRoutes(db: Db) {
  const router = Router();
  const svc = dashboardService(db);

  router.get("/companies/:companyId/dashboard", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const summary = await svc.summary(companyId);
    res.json(summary);
  });

  /**
   * GET /companies/:companyId/sink-dink/production/status
   * Returns the production status for SINK & DINK India AI Media Organisation.
   */
  router.get("/companies/:companyId/sink-dink/production/status", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      // Fetch all agents for this company
      const allAgents = await db
        .select()
        .from(agents)
        .where(eq(agents.companyId, companyId));

      // Filter out terminated and pending_approval agents
      const activeAgents = allAgents.filter(
        (a) => a.status !== "terminated" && a.status !== "pending_approval"
      );

      res.json({
        companyId,
        status: "ready",
        totalAgents: activeAgents.length,
        agents: activeAgents.map((a) => ({
          id: a.id,
          name: a.name,
          role: a.role,
          status: a.status,
        })),
      });
    } catch (error) {
      console.error("Error fetching production status:", error instanceof Error ? error.message : error);
      res.status(500).json({ error: "Failed to fetch production status" });
    }
  });

  /**
   * Helper function to determine prompt based on agent role/name/title
   */
  function getAgentPrompt(agent: typeof agents.$inferSelect): string {
    const role = agent.role.toLowerCase();
    const name = (agent.name || "").toLowerCase();
    const title = (agent.title || "").toLowerCase();

    // Match based on role, name, or title
    if (role === "ceo" || name.includes("ceo") || title.includes("ceo")) {
      return "You are the CEO. Coordinate and merge work from all team members into a cohesive upload-ready Instagram content pack.";
    }
    if (
      role === "researcher" ||
      name.includes("research") ||
      title.includes("research")
    ) {
      return "You are the Research role. Create an audience pain map and identify trend angles for the content.";
    }
    if (role === "strategy" || name.includes("strategy") || title.includes("strategy")) {
      return "You are the Strategy role. Create content pillars and positioning strategy.";
    }
    if (role === "content" || name.includes("content") || title.includes("content")) {
      return "You are the Content role. Create hooks, scripts, captions, CTAs, and relevant hashtags.";
    }
    if (
      role === "media_production" ||
      role.includes("media") ||
      name.includes("media") ||
      name.includes("production") ||
      title.includes("media") ||
      title.includes("production")
    ) {
      return "You are the Media Production role. Create scene direction, on-screen text overlays, and thumbnail specifications.";
    }
    if (role === "qa" || name.includes("qa") || title.includes("qa")) {
      return "You are the QA role. Provide brand safety assessment and upload-readiness score.";
    }
    if (
      role === "automation" ||
      name.includes("automation") ||
      title.includes("automation")
    ) {
      return "You are the Automation role. Document repeatable workflow, dashboard notes, and API integration points.";
    }
    if (role === "memory" || name.includes("memory") || title.includes("memory")) {
      return "You are the Memory role. Create reusable memory templates, content backlog, and reference materials.";
    }
    if (role === "growth" || name.includes("growth") || title.includes("growth")) {
      return "You are the Growth role. Define growth loops, CTAs, monetization strategy, and page positioning.";
    }
    if (role === "cmo" || name.includes("cmo") || title.includes("cmo")) {
      return "You are the CMO. Create comprehensive marketing and content strategy with brand positioning.";
    }
    if (role === "designer" || name.includes("designer") || title.includes("designer")) {
      return "You are the Designer. Create visual assets, layouts, and design specifications for Instagram content.";
    }
    if (role === "engineer" || name.includes("engineer") || title.includes("engineer")) {
      return "You are the Engineer. Create technical integration points and API specifications for content delivery.";
    }

    // Default fallback
    return "You are a team member of SINK & DINK India AI Media Organisation. Create role-specific work for upload-ready Instagram content packs. Provide practical, actionable output.";
  }

  /**
   * POST /companies/:companyId/sink-dink/production/start
   * Starts production agent runs using Google Gemini REST API directly.
   * Returns batch results with outputs from each agent.
   */
  router.post("/companies/:companyId/sink-dink/production/start", async (req, res) => {
    try {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      // Determine which API key to use (do not expose or log this value)
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "API key not configured" });
      }

      // Request body options
      const requestedCount = typeof req.body?.count === "number" ? req.body.count : undefined;
      const agentLimit = typeof req.body?.agentLimit === "number" ? req.body.agentLimit : undefined;
      const preferredModel = typeof req.body?.model === "string" && req.body.model.length > 0 ? req.body.model : undefined;
      const topic = typeof req.body?.topic === "string" && req.body.topic.length > 0 ? req.body.topic : "SINK & DINK India AI Media Organisation";
      const tone = typeof req.body?.tone === "string" && req.body.tone.length > 0 ? req.body.tone : undefined;

      // Fetch all agents for this company
      const allAgents = await db
        .select()
        .from(agents)
        .where(eq(agents.companyId, companyId));

      // Filter out terminated and pending_approval agents
      let activeAgents = allAgents.filter(
        (a) => a.status !== "terminated" && a.status !== "pending_approval"
      );

      // Apply agentLimit for testing if provided
      if (typeof agentLimit === "number" && agentLimit > 0) {
        activeAgents = activeAgents.slice(0, agentLimit);
      }

      // Optionally use requestedCount in prompt construction; include in response

      // Generate batch ID
      const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Prepare model candidates (preferred first, then fallbacks)
      const fallbackModels = [
        "gemini-2.5-flash-lite",
        "gemini-2.5-flash",
        "gemini-2.0-flash-lite",
        "gemini-2.0-flash",
      ];

      const modelCandidates = preferredModel
        ? Array.from(new Set([preferredModel, ...fallbackModels]))
        : fallbackModels.slice();

      // Prepare outputs array
      const outputs: Array<{
        agentId: string;
        agentName: string;
        role: string;
        title: string | null;
        ok: boolean;
        status: string;
        output: string;
        error: string | null;
        modelUsed: string | null;
        attempts: number;
      }> = [];

      // Process agents with concurrency limit of 3
      const concurrencyLimit = 3;
      let successCount = 0;
      let failureCount = 0;

      // Helper function to run a single agent with retries across models for 429/503
      const runAgent = async (agent: typeof agents.$inferSelect) => {
        let attempts = 0;
        let ok = false;
        let lastError: any = null;
        let usedModel: string | null = null;

        try {
          // Get role-specific prompt
          const rolePrompt = getAgentPrompt(agent);

          // Build base prompt
          const basePromptParts = [`${topic}`, `${rolePrompt}`, `Create role-specific work for upload-ready Instagram content packs.`];
          if (typeof requestedCount === "number") {
            basePromptParts.push(`Create ${requestedCount} distinct content packs.`);
          }
          if (tone) {
            basePromptParts.push(`Tone: ${tone}`);
          }
          basePromptParts.push("Provide practical, actionable output that can be directly used in production. Format your response as clear bullet points or structured sections.");

          const prompt = basePromptParts.join("\n");

          const maxAttempts = 3;

          for (attempts = 1; attempts <= maxAttempts; attempts++) {
            // select model for this attempt: use candidate at index attempts-1 if exists, otherwise last candidate
            const modelIndex = Math.min(attempts - 1, modelCandidates.length - 1);
            const modelToUse = modelCandidates[modelIndex];
            usedModel = modelToUse;

            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
              modelToUse
            )}:generateContent`;

            let response: Response;
            try {
              response = await fetch(geminiUrl, {
                method: "POST",
                headers: {
                  "X-goog-api-key": apiKey,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  contents: [
                    {
                      parts: [
                        {
                          text: prompt,
                        },
                      ],
                    },
                  ],
                }),
              });
            } catch (networkErr) {
              // Network error: treat as last error and break
              lastError = networkErr instanceof Error ? networkErr.message : String(networkErr);
              break;
            }

            if (response.ok) {
              const data = (await response.json()) as {
                candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
              };
              const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No output generated";

              ok = true;

              outputs.push({
                agentId: agent.id,
                agentName: agent.name,
                role: agent.role,
                title: agent.title || null,
                ok: true,
                status: "completed",
                output: generatedText,
                error: null,
                modelUsed: usedModel,
                attempts,
              });

              successCount++;
              break; // successful
            } else {
              // Non-OK response: inspect status code
              const statusCode = response.status;
              const errorText = await response.text();
              lastError = `Gemini API error: ${statusCode} - ${errorText}`;

              // Retry only for 429 or 503
              if (statusCode === 429 || statusCode === 503) {
                // continue to next attempt (which may try a different model)
                continue;
              } else {
                // Non-retriable error
                break;
              }
            }
          }

          if (!ok) {
            failureCount++;
            outputs.push({
              agentId: agent.id,
              agentName: agent.name,
              role: agent.role,
              title: agent.title || null,
              ok: false,
              status: "failed",
              output: "",
              error: lastError instanceof Error ? lastError.message : String(lastError),
              modelUsed: usedModel,
              attempts: attempts > 0 ? attempts - 1 : 0,
            });
          }
        } catch (error) {
          failureCount++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          outputs.push({
            agentId: agent.id,
            agentName: agent.name,
            role: agent.role,
            title: agent.title || null,
            ok: false,
            status: "failed",
            output: "",
            error: errorMessage,
            modelUsed: usedModel,
            attempts,
          });
        }
      };

      // Run agents with concurrency limit
      for (let i = 0; i < activeAgents.length; i += concurrencyLimit) {
        const batch = activeAgents.slice(i, i + concurrencyLimit);
        await Promise.all(batch.map((agent) => runAgent(agent)));
      }

      // Determine overall status and HTTP code
      let overallStatus = "ok";
      if (successCount === 0) {
        overallStatus = "failed";
      } else if (failureCount > 0) {
        overallStatus = "partial";
      }

      const responsePayload = {
        batchId,
        companyId,
        requestedCount: requestedCount ?? null,
        count: activeAgents.length,
        agentLimit: agentLimit ?? null,
        modelPreference: preferredModel ?? null,
        topic,
        successfulAgents: successCount,
        failedAgents: failureCount,
        totalAgents: activeAgents.length,
        status: overallStatus,
        outputs,
      } as const;

      if (overallStatus === "failed") {
        // All agents failed: return 503 Service Unavailable
        return res.status(503).json(responsePayload);
      }

      res.json(responsePayload);
    } catch (error) {
      console.error("Error starting production batch:", error instanceof Error ? error.message : error);
      res.status(500).json({ error: "Failed to start production batch" });
    }
  });

  return router;
}

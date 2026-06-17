# SINK DINK India — Top-Level Production Organisation Roadmap

## Purpose

This document is the operating plan for building the SINK DINK India AI Media Organisation into a polished, top-level, production-ready system. It replaces random patching with a staged, test-gated build process.

The organisation must produce respectful, high-quality, upload-ready Instagram media packs for the SINK/DINK India niche while keeping publishing blocked until human approval.

## Current confirmed state

- Render/Paperclip control room is live.
- Hugging Face media worker is live.
- Remote worker bridge is live through Render.
- Supabase jobs and audit logs are connected.
- Single job flow is working end-to-end.
- Media worker v2 can generate a media pack including final_reel.mp4.
- Bulk campaign endpoint has been added for staged multi-topic generation.

## Build philosophy

1. No random edits.
2. Study first, patch second, deploy third, verify fourth.
3. Every deploy must have a rollback-safe scope.
4. Existing working routes must not be broken when adding new features.
5. Human approval remains mandatory before publishing.
6. Free-first infrastructure is used, but 24/7 operation requires a paid always-on server later.

## Target production organisation

The final organisation must act like a real media company team:

1. CEO Agent
   - Receives a high-level instruction.
   - Converts it into a campaign brief.
   - Assigns tasks to specialist departments.
   - Reviews final packs before human approval.

2. Research Department
   - Detects audience pains.
   - Studies trends and cultural context.
   - Tracks competitor formats.
   - Avoids stale or low-quality topics.

3. Strategy Department
   - Converts research into content angles.
   - Defines emotional hook, promise, and target audience.
   - Maintains brand positioning.

4. Content Department
   - Writes hooks, scripts, captions, carousel copy, and comments.
   - Uses Hinglish suitable for Indian Instagram.
   - Avoids disrespect, anti-family tone, or child-hate framing.

5. Media Production Department
   - Converts approved scripts into upload-ready media packs.
   - Generates script, storyboard, cover, captions, hashtags, QA report, and reel file.

6. QA Department
   - Checks brand safety.
   - Checks factual risk.
   - Checks tone and cultural sensitivity.
   - Blocks publishing until human approval.

7. Memory Department
   - Logs every job, result, failure, and lesson.
   - Updates future content rules.

8. Growth Department
   - Reviews performance once real posts are published.
   - Suggests next campaigns.

## Production quality gates

A feature is not considered complete until all gates pass:

### Gate A — Infrastructure

- Render health OK.
- HF worker health OK.
- Supabase jobs table insert OK.
- Supabase audit table insert OK.
- File links open in browser.

### Gate B — Single media job

- One topic creates media pack.
- final_reel.mp4 exists.
- cover image exists.
- caption and hashtags exist.
- qa_report.md exists.
- Supabase row exists.

### Gate C — Bulk campaign job

- 3 to 10 topics run sequentially.
- Every successful job has its own jobId.
- Failed jobs are logged without breaking the batch.
- Batch summary is logged.

### Gate D — AI content brain

- Gemini produces campaign brief, hooks, scripts, captions, and QA notes.
- Output is passed into HF worker as mediaPack.
- No placeholder text remains.
- Content quality is judged against top Indian Instagram page standards.

### Gate E — Approval workflow

- Every pack is marked pending_human_approval.
- PublishingBlocked remains true.
- User can review links before upload.

### Gate F — Control room polish

- User does not need browser console for normal use.
- UI shows campaign/job list, file links, status, and approval state.
- Errors are visible in simple language.

## Next build stages

### Stage 1 — Stabilize current pipeline

Goal: make sure current single and bulk output flow is stable.

Tasks:
- Test bulk-create endpoint after deployment.
- Confirm Supabase receives all rows.
- Confirm final_reel.mp4 opens for every job.
- Record failures and limits.

Acceptance:
- 5-topic campaign completes with 0 critical errors.

### Stage 2 — Add Gemini content brain

Goal: replace template output with top-level AI-generated content.

Tasks:
- Create campaign brief endpoint.
- Create script/caption/hashtag JSON output schema.
- Add strict SINK/DINK brand guardrails.
- Pass AI-generated mediaPack into HF worker.

Acceptance:
- One topic produces non-placeholder, high-quality script and reel pack.

### Stage 3 — Add campaign command endpoint

Goal: one command produces a full campaign pack.

Tasks:
- Add endpoint for campaign topic + count.
- Generate 5 to 10 content ideas.
- Generate media pack for each idea.
- Log batch result.

Acceptance:
- One request creates a full mini-campaign.

### Stage 4 — Add QA scoring

Goal: prevent low-quality or risky posts.

Tasks:
- Add QA rubric JSON.
- Score hook, script, caption, tone, brand fit.
- Block low-score outputs.
- Save QA report.

Acceptance:
- Every pack has a machine-readable QA score and human-readable QA report.

### Stage 5 — Add control room UI

Goal: remove console dependence.

Tasks:
- Add simple page/widget showing jobs.
- Show output links.
- Show approval status.
- Add run campaign button.

Acceptance:
- User can run and review jobs from UI.

### Stage 6 — Improve media quality

Goal: better reel style.

Tasks:
- Improve typography.
- Add multiple visual templates.
- Add branded covers.
- Add voiceover generation if stable on free hardware.
- Add audio later only after stability.

Acceptance:
- Output looks presentable for Instagram testing.

## Error prevention rules

- Do not edit many unrelated production files in one patch.
- Add new routes before replacing old routes.
- Keep old working endpoints alive.
- Avoid secrets in GitHub files.
- Never expose Supabase service key.
- Never expose Hugging Face token.
- Test health before create.
- Test single create before bulk create.
- Test bulk create before UI integration.

## Immediate next action

After current deploy completes:

1. Test `/api/health/sink-dink/remote-worker/bulk-create` with 3 topics.
2. Confirm Supabase rows.
3. Confirm MP4 links.
4. Then implement Gemini content brain as the next bulk patch.

## Definition of fully polished top-level organisation

The system will be considered fully built when the user can say:

"CEO, SINK DINK India ke liye 10 reel ka campaign banao"

and the organisation returns:

- campaign strategy,
- 10 topics,
- 10 scripts,
- 10 captions,
- 10 hashtag sets,
- 10 cover images,
- 10 final reel files,
- QA reports,
- Supabase logs,
- approval status,
- and a simple review interface.

Publishing must remain manual until the user explicitly approves future auto-publishing.

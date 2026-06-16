# AI Media Organisation — Master Context

## Current Mode
This repository is being used to build and test a Paperclip-based AI media organisation inside a testing company/project. This is not the final production company yet. The final company will be created later after this test organisation proves the full workflow.

## Locked Goal
Build an AI organisation that can do the same work that top-level Instagram pages do manually, but through AI agents and automation.

Final output must be ready-to-upload media content, not just prompts or text.

## Required Final Output
Every completed content job should produce a complete upload-ready pack:

- final_reel.mp4
- cover image or SVG/PNG
- voiceover audio
- subtitles or subtitle text
- caption.txt
- hashtags.txt
- qa_report.md
- media_pack.json
- learning_note.md

## Current Niche Test Project
SINK DINK India.

SINK/DINK means Single Income No Kids / Double Income No Kids.

The page direction is respectful no-kids / childfree / couple timeline / family pressure / financial peace / modern Indian relationship content.

## Core Workflow
Research -> Audience Pain -> Competitor Study -> Strategy -> Hook -> Script -> Visual Direction -> Audio/Voice -> Media Render -> QA -> Approval -> Memory -> Improvement.

## Current Architecture Direction
Paperclip must remain the control room. Heavy media rendering must move to a separate media worker server to reduce Render crashes and 502/503 errors.

Preferred free-first architecture:

- Render: Paperclip dashboard, agents, tasks, approvals
- Hugging Face Spaces Docker: media rendering worker, ffmpeg, voiceover, MP4/ZIP output
- GitHub: permanent memory, code, SOP, learning history
- Supabase later: live job queue, job status, analytics, output metadata
- GitHub Actions: backup or batch renderer
- Codespaces: development/debugging

## Important Safety Rules
- CEO and agents stay paused unless explicitly approved.
- No auto-publishing.
- No connector activation without approval.
- No paid API expansion without approval.
- Human approval is required before any content is uploaded.

## Current Known Progress
- Paperclip testing company live.
- Real agents created.
- Custom skills created.
- Skill routing matrix created.
- SOP and routines created.
- Gemini direct bridge working.
- Real Gemini call verified.
- SINK/DINK brand guardrail added.
- Media output route added.
- ffmpeg and espeak detected on Render.
- Render heavy media render caused 502/503; multi-server media worker is now the correct path.

## Next Priority
Create the multi-server media worker and connect Paperclip to it. Then add GitHub memory logging and Organisation Builder Agent behavior.

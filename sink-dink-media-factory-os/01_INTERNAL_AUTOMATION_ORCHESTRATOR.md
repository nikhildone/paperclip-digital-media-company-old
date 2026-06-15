# Internal Automation Orchestrator

## Purpose
Make Paperclip work like a workflow automation system, but stronger because it uses AI agents, tasks, skills, artifacts, approval gates, and self-learning.

## Replacement Logic
Traditional workflow tools use trigger -> node -> condition -> action.

Paperclip Media Factory uses:
Goal -> CEO reasoning -> task decomposition -> agent assignment -> skill execution -> tool call -> file generation -> QA -> approval -> artifact pack -> learning update.

## Core Components
1. Trigger Layer
   - Manual command
   - Routine schedule
   - Future webhook
   - Comment wake
   - Blocker resolved wake

2. Router Layer
   - Reads request
   - Chooses workflow type
   - Assigns correct agent
   - Sets priority
   - Creates subtasks

3. Execution Layer
   - Research
   - Content strategy
   - Script writing
   - Carousel writing
   - Media rendering
   - QA
   - Artifact packaging

4. Approval Layer
   - Draft review
   - Media review
   - Final upload-ready approval
   - No auto-publishing without human approval

5. Learning Layer
   - Review output quality
   - Detect bottlenecks
   - Suggest skill updates
   - Ask approval before major changes

## Workflow Types
- Daily content factory
- One-time content pack
- Trend research
- Reel pack generation
- Carousel pack generation
- QA-only review
- System improvement
- Connector/tool setup

## Manual Work Rule
Any future automation should reduce manual work. Prefer one-shot scripts, bulk task creation, and reusable templates.

## Success Criteria
The user gives one command and receives a complete upload-ready pack with files, captions, QA, and checklist.

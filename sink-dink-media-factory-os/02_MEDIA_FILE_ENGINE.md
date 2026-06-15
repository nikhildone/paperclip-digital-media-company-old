# Media File Engine

## Purpose
Turn SINK DINK content plans into final upload-ready media files.

## Required Final Output
final_upload_pack/
- reels/
  - reel_01.mp4
  - reel_02.mp4
  - subtitles_01.srt
  - reel_scripts.md
- carousels/
  - carousel_01_slide_01.png
  - carousel_01_slide_02.png
  - carousel_text.md
- captions/
  - instagram_captions.md
  - youtube_shorts_captions.md
  - hashtags.md
- preview/
  - platform_preview.html
- qa/
  - qa_report.md
- upload_checklist.md

## Reel Generation Pipeline
Script -> visual plan -> voiceover -> subtitles -> background visuals -> video render -> MP4 -> QA.

## Carousel Generation Pipeline
Carousel copy -> slide plan -> HTML/CSS or design template -> image render -> PNG/JPG -> QA.

## Minimum Technical Needs
- Video renderer
- Image renderer
- Text-to-speech or voiceover fallback
- Subtitle generator
- File packager
- Artifact uploader

## Fallback Mode
If video rendering is not available, the system must still produce:
- full scripts
- voiceover text
- subtitle text
- shot list
- design brief
- manual editing pack

## Quality Rules
- All files must be named clearly.
- Every output must include upload checklist.
- Every media file must pass QA before final.
- No file is considered final without human approval.

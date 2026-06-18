from fastapi import FastAPI
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pathlib import Path
from uuid import uuid4
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import json, subprocess, textwrap, html, math, random

app = FastAPI(title="SINK DINK Media Worker")
ROOT = Path("/tmp/sink_dink_worker")
ROOT.mkdir(parents=True, exist_ok=True)
FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
W, H = 1080, 1920

class CreateRequest(BaseModel):
    topic: str = "SINK DINK India test topic"
    tone: str = "respectful Hinglish"
    durationSec: int = 25
    mediaPack: dict | None = None

def safe_name(value: str) -> str:
    return "".join(ch for ch in value if ch.isalnum() or ch in "-_.")

def font(size: int, bold: bool = False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size)

def wrap(text: str, width: int):
    return textwrap.wrap(str(text or ""), width=width) or [""]

def center(draw, text, y, size, fill=(255,255,255), bold=False, width=21, gap=14):
    f = font(size, bold)
    for line in wrap(text, width):
        box = draw.textbbox((0, 0), line, font=f)
        draw.text(((W - (box[2]-box[0]))//2, y), line, font=f, fill=fill)
        y += (box[3]-box[1]) + gap
    return y

def media_pack(req: CreateRequest) -> dict:
    if req.mediaPack:
        return dict(req.mediaPack)
    return {
        "title": "SINK DINK India Upload Pack",
        "topic": req.topic.strip() or "SINK DINK India",
        "tone": req.tone,
        "durationSec": req.durationSec,
        "hook": "Good news kab doge? Har couple ka answer same nahi hota.",
        "script": [
            "Good news kab doge? Pressure real hota hai.",
            "Har couple ka timeline alag hota hai.",
            "SINK DINK selfish nahi, responsible planning hai.",
            "Family ko respect, par decision calm mind se."
        ],
        "caption": "Good news ka pressure real hai. Respect family ko bhi, peace relationship ko bhi.",
        "hashtags": ["#SINKDINKIndia", "#ModernRelationships", "#IndianCouples", "#FinancialPeace"],
        "visualStyle": "premium editorial Instagram reel",
        "approvalStatus": "pending_human_approval"
    }

def gradient(seed: int):
    img = Image.new("RGB", (W, H), (8, 10, 18))
    px = img.load()
    palettes = [((8,10,28),(39,22,77),(12,83,113)), ((12,13,23),(93,24,54),(180,83,9)), ((7,18,22),(12,84,73),(86,37,121))]
    c1, c2, c3 = palettes[seed % len(palettes)]
    for y in range(H):
        t = y / max(1, H-1)
        for x in range(W):
            u = x / max(1, W-1)
            r = int(c1[0]*(1-t) + c2[0]*t + c3[0]*0.20*u)
            g = int(c1[1]*(1-t) + c2[1]*t + c3[1]*0.20*u)
            b = int(c1[2]*(1-t) + c2[2]*t + c3[2]*0.20*u)
            px[x,y] = (r,g,b)
    return img.filter(ImageFilter.GaussianBlur(0.4))

def decorate(draw, seed: int):
    random.seed(seed)
    for _ in range(9):
        x = random.randint(-120, W-120); y = random.randint(80, H-280); s = random.randint(120, 330)
        color = random.choice([(255,255,255,24),(250,204,21,38),(96,165,250,42),(244,114,182,34),(45,212,191,34)])
        layer = Image.new("RGBA", (W,H), (0,0,0,0)); d = ImageDraw.Draw(layer)
        d.ellipse((x, y, x+s, y+s), fill=color)
        yield layer.filter(ImageFilter.GaussianBlur(24))

def paste_layers(img, seed):
    base = img.convert("RGBA")
    for layer in decorate(ImageDraw.Draw(base), seed):
        base.alpha_composite(layer)
    return base.convert("RGB")

def chip(draw, text, x, y, fill=(255,255,255), bg=(15,23,42)):
    f = font(30, True); box = draw.textbbox((0,0), text, font=f); pad = 18
    draw.rounded_rectangle((x, y, x+box[2]-box[0]+pad*2, y+54), radius=26, fill=bg, outline=(148,163,184), width=2)
    draw.text((x+pad, y+9), text, font=f, fill=fill)

def make_scene(path: Path, pack: dict, line: str, index: int, total: int):
    img = paste_layers(gradient(index), index)
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((52, 52, 1028, 1868), radius=44, outline=(255,255,255), width=3)
    chip(draw, "SINK DINK INDIA", 88, 92, bg=(15,23,42))
    chip(draw, f"Scene {index}/{total}", 812, 92, bg=(30,41,59))
    hook = str(pack.get("hook") or pack.get("topic") or "SINK DINK India")
    y = 330
    y = center(draw, hook, y, 68, (255,255,255), True, 19, 18)
    draw.rounded_rectangle((96, y+52, 984, y+430), radius=36, fill=(15,23,42), outline=(51,65,85), width=2)
    center(draw, line, y+105, 50, (226,232,240), False, 26, 16)
    draw.text((96, 1710), "Human approval required · No auto-posting", font=font(32), fill=(203,213,225))
    draw.text((96, 1760), "Premium visual pack v3", font=font(30, True), fill=(147,197,253))
    img.save(path, quality=94)

def make_cover_svg(path: Path, pack: dict):
    topic = html.escape(str(pack.get("topic", "SINK DINK India")))
    hook = html.escape(str(pack.get("hook", "Good news? Har answer alag hota hai.")))
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0f172a"/><stop offset=".55" stop-color="#581c87"/><stop offset="1" stop-color="#0e7490"/></linearGradient></defs>
<rect width="1080" height="1920" fill="url(#g)"/><circle cx="850" cy="300" r="220" fill="#38bdf8" opacity=".25"/><circle cx="160" cy="1450" r="300" fill="#f59e0b" opacity=".20"/>
<rect x="60" y="60" width="960" height="1800" rx="48" fill="none" stroke="#ffffff" stroke-width="4" opacity=".8"/>
<text x="90" y="150" fill="#cbd5e1" font-size="38" font-family="Arial" font-weight="700">SINK DINK INDIA</text>
<text x="90" y="650" fill="#ffffff" font-size="72" font-weight="700" font-family="Arial">{hook[:44]}</text>
<text x="90" y="850" fill="#e2e8f0" font-size="46" font-family="Arial">{topic[:70]}</text>
<text x="90" y="1760" fill="#dbeafe" font-size="34" font-family="Arial">Human approval required · No auto-posting</text>
</svg>'''
    path.write_text(svg, encoding="utf-8")

def render_video(job_dir: Path, slides: list[Path], total_seconds: int) -> Path:
    concat = job_dir / "slides.txt"
    dur = max(3, int(total_seconds / max(1, len(slides))))
    lines = []
    for slide in slides:
        lines += [f"file '{slide.as_posix()}'", f"duration {dur}"]
    lines.append(f"file '{slides[-1].as_posix()}'")
    concat.write_text("\n".join(lines), encoding="utf-8")
    out = job_dir / "final_reel.mp4"
    subprocess.run(["ffmpeg","-y","-f","concat","-safe","0","-i",str(concat),"-f","lavfi","-i","anullsrc=channel_layout=stereo:sample_rate=44100","-shortest","-c:v","libx264","-pix_fmt","yuv420p","-r","30","-c:a","aac","-t",str(max(total_seconds, dur*len(slides))),str(out)], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return out

def preview_grid(path: Path, slides: list[Path]):
    thumbs = [Image.open(p).resize((270,480)) for p in slides[:4]]
    out = Image.new("RGB", (1080, 960), (8,10,18));
    for i, t in enumerate(thumbs): out.paste(t, ((i%4)*270, 0))
    out.save(path, quality=92)

@app.get("/health")
def health():
    return {"ok": True, "service": "sink-dink-media-worker", "mode": "media_pack_v3_visual_rich", "time": datetime.utcnow().isoformat()}

@app.post("/create")
def create(req: CreateRequest):
    job_id = datetime.utcnow().strftime("%Y%m%d") + "-" + uuid4().hex[:10]
    job_dir = ROOT / job_id; job_dir.mkdir(parents=True, exist_ok=True)
    pack = media_pack(req); script = pack.get("script", [])
    if isinstance(script, str): script = [script]
    script = [str(x).strip() for x in script if str(x).strip()] or media_pack(req)["script"]
    pack["script"] = script; pack["workerMode"] = "media_pack_v3_visual_rich"; pack["publishingBlocked"] = True
    (job_dir/"media_pack.json").write_text(json.dumps(pack, indent=2, ensure_ascii=False), encoding="utf-8")
    (job_dir/"script.txt").write_text("\n".join(script), encoding="utf-8")
    (job_dir/"voiceover.txt").write_text("\n".join(script), encoding="utf-8")
    (job_dir/"caption.txt").write_text(str(pack.get("caption", "Human approval required.")), encoding="utf-8")
    (job_dir/"hashtags.txt").write_text(" ".join(pack.get("hashtags", [])), encoding="utf-8")
    slides = []
    for i, line in enumerate(script[:6], 1):
        p = job_dir / f"scene_{i:02d}.png"; make_scene(p, pack, line, i, min(len(script),6)); slides.append(p)
    (job_dir/"cover.png").write_bytes(slides[0].read_bytes()); make_cover_svg(job_dir/"cover.svg", pack)
    preview_grid(job_dir/"preview_grid.png", slides)
    storyboard = [{"scene": i+1, "text": line, "asset": f"scene_{i+1:02d}.png", "durationSec": max(3, int(req.durationSec/max(1,len(script))))} for i,line in enumerate(script[:6])]
    manifest = {"workerMode":"media_pack_v3_visual_rich","jobId":job_id,"topic":pack.get("topic"),"visualStyle":pack.get("visualStyle"),"assets":[f"scene_{i+1:02d}.png" for i in range(len(slides))],"publishingBlocked":True,"humanApprovalRequired":True}
    (job_dir/"storyboard.json").write_text(json.dumps(storyboard, indent=2, ensure_ascii=False), encoding="utf-8")
    (job_dir/"visual_manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    (job_dir/"qa_report.md").write_text("# QA Report\n\nStatus: generated_media_pack_v3_visual_rich\n\nPublishing: blocked until human approval.\n\nIncludes visual scenes, cover, preview grid, manifest and MP4.\n", encoding="utf-8")
    video_ok = True
    try: render_video(job_dir, slides, req.durationSec)
    except Exception as exc:
        video_ok = False; (job_dir/"video_error.txt").write_text(str(exc), encoding="utf-8")
    names = ["media_pack.json","script.txt","voiceover.txt","caption.txt","hashtags.txt","storyboard.json","visual_manifest.json","cover.svg","cover.png","preview_grid.png","qa_report.md"] + [p.name for p in slides]
    names.append("final_reel.mp4" if video_ok else "video_error.txt")
    return {"ok": True, "jobId": job_id, "status": "completed_media_pack_v3_visual_rich" if video_ok else "completed_without_video", "videoCreated": video_ok, "humanApprovalRequired": True, "publishingBlocked": True, "files": [{"file": n, "url": f"/files/{job_id}/{n}"} for n in names]}

@app.get("/status/{job_id}")
def status(job_id: str):
    d = ROOT / safe_name(job_id)
    return {"ok": d.exists(), "jobId": job_id, "status": "found" if d.exists() else "not_found"}

@app.get("/files/{job_id}/{file_name}")
def files(job_id: str, file_name: str):
    p = ROOT / safe_name(job_id) / safe_name(file_name)
    if not p.exists(): return {"ok": False, "error": "file_not_found"}
    return FileResponse(p)

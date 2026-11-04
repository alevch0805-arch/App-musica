#!/usr/bin/env python3
"""Convierte media/kametra.m4a en un video MP4 karaoke.

Uso:  python3 tools/make_video.py [audio] [letra.lrc] [salida.mp4] [título]
Por defecto: media/kametra.m4a  media/kametra.lrc  media/kametra_karaoke.mp4

Si existe el .lrc, la letra se quema en el video con relleno progresivo
estilo karaoke (\\kf de ASS). Si no existe, genera el video solo con el
visualizador y el título.
"""
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
audio = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "media/kametra.m4a")
lrc = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "media/kametra.lrc")
out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(ROOT, "media/kametra_karaoke.mp4")
title = sys.argv[4] if len(sys.argv) > 4 else "Kametra"


def duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "csv=p=0", path], capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def parse_lrc(path):
    lines = []
    with open(path, encoding="utf-8") as f:
        for raw in f:
            tags = re.findall(r"\[(\d+):(\d+(?:[.:]\d+)?)\]", raw)
            text = re.sub(r"\[[^\]]*\]", "", raw).strip()
            for m, s in tags:
                lines.append((int(m) * 60 + float(s.replace(":", ".")), text))
    return sorted(lines)


def ass_time(t):
    h, rem = divmod(max(t, 0), 3600)
    m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def esc(text):
    return text.replace("\\", "\\\\").replace("{", "(").replace("}", ")")


def build_ass(lines, total):
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cur,DejaVu Sans,60,&H009A3DFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,4,2,5,40,40,0,1
Style: Next,DejaVu Sans,44,&H80FFFFFF,&H80FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,1,5,40,40,0,1
Style: Title,DejaVu Sans,30,&H40FFFFFF,&H40FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,2,0,7,32,32,28,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,{ass_time(0)},{ass_time(total)},Title,,0,0,0,,{esc(title)}
"""
    ev = []
    for i, (t, text) in enumerate(lines):
        end = lines[i + 1][0] if i + 1 < len(lines) else min(total, t + 6)
        if not text:
            continue
        # Duración del relleno: proporcional al texto, sin pasar del inicio de la siguiente línea
        fill = min(end - t, max(1.5, len(text) * 0.11 + 0.8)) * 0.92
        end = min(end, t + fill + 4)  # no dejar la línea fija durante interludios largos
        words = text.split()
        weights = [len(w) + 1 for w in words]
        cs_total = int(fill * 100)
        parts, acc = [], 0
        for j, w in enumerate(words):
            k = cs_total - acc if j == len(words) - 1 else int(cs_total * weights[j] / sum(weights))
            acc += k
            parts.append(f"{{\\kf{k}}}{esc(w)} ")
        ev.append(f"Dialogue: 1,{ass_time(t)},{ass_time(end)},Cur,,0,0,0,,{{\\pos(640,330)\\fad(120,80)}}{''.join(parts).strip()}")
        if i + 1 < len(lines) and lines[i + 1][1]:
            ev.append(f"Dialogue: 1,{ass_time(t)},{ass_time(end)},Next,,0,0,0,,{{\\pos(640,430)\\fad(120,80)}}{esc(lines[i + 1][1])}")
    # Primera línea anunciada antes de que empiece
    if lines and lines[0][0] > 1:
        ev.append(f"Dialogue: 1,{ass_time(0)},{ass_time(lines[0][0])},Next,,0,0,0,,{{\\pos(640,430)}}{esc(lines[0][1])}")
    return head + "\n".join(ev) + "\n"


def main():
    total = duration(audio)
    lines = parse_lrc(lrc) if os.path.exists(lrc) else []
    with tempfile.TemporaryDirectory() as tmp:
        ass_path = os.path.join(tmp, "k.ass")
        with open(ass_path, "w", encoding="utf-8") as f:
            f.write(build_ass(lines, total))
        graph = (
            f"color=c=0x140a22:s=1280x720:r=30:d={total}[bg];"
            "[0:a]showfreqs=s=1280x260:mode=bar:ascale=sqrt:fscale=log:colors=0xff3d9a|0x5ad1ff:win_size=1024,"
            "format=rgba,colorchannelmixer=aa=0.55[viz];"
            "[0:a]showwaves=s=1280x120:mode=cline:colors=0x5ad1ff@0.5:rate=30,format=rgba[wav];"
            "[bg][viz]overlay=0:H-h:shortest=1[a];[a][wav]overlay=0:520:shortest=1[b];"
            f"[b]ass='{ass_path}'[v]"
        )
        cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-stats", "-i", audio,
               "-filter_complex", graph, "-map", "[v]", "-map", "0:a",
               "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
               "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out]
        subprocess.run(cmd, check=True)
    print(f"Video creado: {out} ({len(lines)} líneas de letra)")


if __name__ == "__main__":
    main()

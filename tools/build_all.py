#!/usr/bin/env python3
"""Genera el .lrc y el video MP4 karaoke de cada canción de tools/songs.json.

Uso:  python3 tools/build_all.py            (todas, LRC + video)
      python3 tools/build_all.py --solo-lrc (solo los .lrc, rápido)
      python3 tools/build_all.py 17         (solo las canciones cuyo id contiene "17")

Si un audio tiene un .lrc sincronizado a mano (media/<id>.manual.lrc,
exportado desde index.html), se usa ese en lugar de los tiempos estimados.
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))


def syllables(line):
    return max(1, len(re.findall(r"[aeiouáéíóúü]+", line.lower())))


def fmt(t):
    return f"{int(t // 60):02d}:{t % 60:05.2f}"


def song_lines(song):
    out = []
    for start, end, names in song["bloques"]:
        lines = [l for n in names.split("+") for l in song["secciones"][n]]
        w = [syllables(l) + 2 for l in lines]  # +2: respiro entre líneas
        total, acc = sum(w), 0
        for line, wi in zip(lines, w):
            out.append((start + (end - start) * acc / total, line))
            acc += wi
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    only_lrc = "--solo-lrc" in sys.argv
    with open(os.path.join(ROOT, "tools/songs.json"), encoding="utf-8") as f:
        songs = json.load(f)["canciones"]
    for s in songs:
        if args and not any(a in s["id"] for a in args):
            continue
        lrc = os.path.join(ROOT, "media", s["id"] + ".lrc")
        with open(lrc, "w", encoding="utf-8") as f:
            f.write(f"[ti:{s['titulo']}]\n")
            f.write("\n".join(f"[{fmt(t)}] {l}" for t, l in song_lines(s)) + "\n")
        print("LRC:", lrc)
        if only_lrc:
            continue
        manual = os.path.join(ROOT, "media", s["id"] + ".manual.lrc")
        subprocess.run([sys.executable, os.path.join(ROOT, "tools/make_video.py"),
                        os.path.join(ROOT, s["audio"]),
                        manual if os.path.exists(manual) else lrc,
                        os.path.join(ROOT, "media", s["id"] + "_karaoke.mp4"),
                        s["titulo"]], check=True)


if __name__ == "__main__":
    main()

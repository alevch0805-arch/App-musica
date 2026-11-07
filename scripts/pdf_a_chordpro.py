#!/usr/bin/env python3
"""
Convierte un himnario en PDF con «acordes encima de la letra» a archivos ChordPro.

Pensado para himnarios donde:
  - cada himno empieza con un título grande «N. TÍTULO»;
  - los acordes van en negrita en la línea de arriba de la letra;
  - las estrofas se numeran («1», «2»…) y los coros se marcan con «CORO».

Usa la posición real de cada letra en la página para poner cada acorde sobre su
sílaba, y recoloca los bemoles/sostenidos que en algunos PDF quedan sueltos
(pequeños, junto al acorde).

Uso (necesita: pip install pdfplumber; un .docx se pasa antes a PDF con
LibreOffice: soffice --headless --convert-to pdf himnario.docx):

    python3 scripts/pdf_a_chordpro.py himnario.pdf contenido/mi-himnario --id mi-himnario --nombre "Mi himnario"

Escribe un .cho por himno, himnario.json y revision.txt (avisos para revisar a mano).
"""
from __future__ import annotations

import argparse
import collections
import json
import re
import statistics
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import pdfplumber

NOTE = r'(?:[A-G]|Do|Re|Mi|Fa|Sol|La|Si)'
CHORD_RE = re.compile(rf'{NOTE}(?:#|b)?(?:maj|min|dim|aug|sus|add|m|M|\+|°|[0-9])*(?:/{NOTE}(?:#|b)?)?')
SECTION_RE = re.compile(
    r'^(?:(?P<num>\d{1,2})|(?P<coro>(?:PRE-?)?CORO(?:\s+(?:[IVX]+|\d|FINAL))?)|(?P<otro>INTRODUCCI[OÓ]N|INTRO|FINAL|INTERMEDIO|PUENTE|ESTRIBILLO))$',
    re.IGNORECASE,
)


@dataclass
class Token:
    text: str
    x0: float
    x1: float


@dataclass
class Line:
    top: float
    size: float
    bold: float  # proporción de letras en negrita
    italic: float
    chars: list = field(default_factory=list)
    beside_label: bool = False  # acordes en la misma fila que «Introducción»/«Final»

    @property
    def text(self) -> str:
        return ''.join(c['text'] for c in self.chars)

    def tokens(self) -> list[Token]:
        out: list[Token] = []
        cur: list = []
        for c in self.chars + [None]:
            if c is None or c['text'].isspace():
                if cur:
                    out.append(Token(''.join(x['text'] for x in cur), cur[0]['x0'], cur[-1]['x1']))
                    cur = []
            else:
                if cur and c['x0'] - cur[-1]['x1'] > 0.25 * c['size']:
                    out.append(Token(''.join(x['text'] for x in cur), cur[0]['x0'], cur[-1]['x1']))
                    cur = []
                cur.append(c)
        return out


def is_bold(c) -> bool:
    return 'Bold' in c['fontname']


def split_chords(token: str) -> list[str] | None:
    """'C#mCmBm' -> ['C#m','Cm','Bm']; devuelve None si no es una secuencia de acordes."""
    t = token.strip('.,;:')
    if not t:
        return []
    out, pos = [], 0
    while pos < len(t):
        m = CHORD_RE.match(t, pos)
        if not m or m.end() == pos:
            return None
        out.append(m.group(0))
        pos = m.end()
    return out


def is_horizontal(c) -> bool:
    """Texto horizontal. Algunos PDF (p. ej. exportados de Canva) traen una inclinación
    ínfima (1e-07) y pdfplumber los marca como «no verticales»; se tolera."""
    m = c.get('matrix')
    if m:
        return abs(m[1]) < 0.01 and abs(m[2]) < 0.01 and m[0] > 0
    return c.get('upright', True)


def page_lines(page) -> tuple[list[Line], list[dict], float]:
    chars = [c for c in page.chars if c['text'] and is_horizontal(c)]
    if not chars:
        return [], [], 0
    sizes = collections.Counter(round(c['size'] * 2) / 2 for c in chars if not c['text'].isspace())
    body = sizes.most_common(1)[0][0]
    # Bemoles/sostenidos sueltos: pequeños, en negrita, aislados.
    accidentals, rest = [], []
    for c in chars:
        if c['text'] in '#b' and is_bold(c) and c['size'] <= 0.72 * body:
            accidentals.append(c)
        else:
            rest.append(c)
    rest.sort(key=lambda c: (round(c['top'], 1), c['x0']))
    lines: list[Line] = []
    for c in rest:
        tol = 0.45 * max(c['size'], body)
        target = None
        for ln in reversed(lines[-4:]):
            if abs(ln.top - c['top']) <= tol and abs(ln.size - c['size']) < 0.3 * body:
                target = ln
                break
        if target is None:
            target = Line(top=c['top'], size=c['size'], bold=0, italic=0)
            lines.append(target)
        target.chars.append(c)
    for ln in lines:
        ln.chars.sort(key=lambda c: c['x0'])
        letters = [c for c in ln.chars if not c['text'].isspace()]
        if letters:
            ln.size = statistics.median(c['size'] for c in letters)
            ln.bold = sum(map(is_bold, letters)) / len(letters)
            ln.italic = sum('Italic' in c['fontname'] for c in letters) / len(letters)
    lines = [ln for ln in lines if ln.text.strip()]
    lines = [part for ln in lines for part in split_label(ln)]
    lines.sort(key=lambda ln: ln.top)
    return lines, accidentals, body


# (la negación va sin IGNORECASE: «IntroducciónB» = etiqueta + acorde B pegados)
LABEL_RE = re.compile(r'^\s*((?i:introducci[oó]n|intro|final|intermedio|puente))(?![a-záéíóúñ])')


def split_label(ln: Line) -> list[Line]:
    """«Introducción   A  G7  C#m» en la misma fila: separa la etiqueta de los acordes."""
    m = LABEL_RE.match(ln.text)
    if not m:
        return [ln]
    n = m.end()
    label_chars, rest = ln.chars[:n], ln.chars[n:]
    letters = [c for c in rest if not c['text'].isspace()]
    if not letters:
        return [ln]
    if sum(map(is_bold, letters)) / len(letters) < 0.6:
        # «FinalHombres de valor.»: etiqueta (más pequeña) pegada a una frase cantada
        label_size = statistics.median(c['size'] for c in label_chars if not c['text'].isspace())
        rest_size = statistics.median(c['size'] for c in letters)
        if label_size < rest_size - 0.4:
            lab = Line(top=ln.top - 0.01, size=rest_size, bold=0, italic=0, chars=label_chars)
            txt = Line(top=ln.top, size=rest_size, bold=0, italic=0, chars=rest)
            return [lab, txt]
        return [ln]
    lab = Line(top=ln.top - 0.01, size=ln.size, bold=0, italic=0, chars=label_chars)
    chords = Line(top=ln.top, size=ln.size, bold=1, italic=0, chars=rest, beside_label=True)
    return [lab, chords]


@dataclass
class ChordLine:
    top: float
    chords: list[tuple[str, float]]  # (acorde, x)
    prefix: str = ''
    suffix: str = ''
    origin: float = 0.0  # inicio de la línea de acordes (margen)
    scale: float | None = None  # corrección del espaciado calculada para esta línea


QUALITY_ONLY = re.compile(r'^(?:maj|min|dim|aug|sus|add|m|M|\+|°|[0-9])+$')


def as_chord_line(ln: Line) -> ChordLine | None:
    if ln.bold < 0.6:
        return None
    body = ln.size
    chords: list[tuple[str, float]] = []
    prefix = suffix = ''
    for t in ln.tokens():
        text = t.text
        if text.startswith('//') or text.startswith('||'):
            prefix, text = '//', text[2:]
        if text.endswith('//') or text.endswith('||'):
            suffix, text = '//', text[:-2]
        # «F 7-B7»: el guion separa dos acordes; «/ D / E»: barras de compás
        if text in ('/', '|'):
            continue
        if text.startswith('/') and not text.startswith('//'):
            text = text[1:]
        pieces = [p for p in re.split(r'[-–]', text)]
        width = (t.x1 - t.x0) / max(len(text), 1)
        offset = 0
        for piece in pieces:
            x = t.x0 + offset * width
            offset += len(piece) + 1
            piece = piece.strip('.,;:()')
            piece = re.sub(r'^([A-G])3(?=m|$)', r'\1#', piece)  # «C3 m»: el # se leyó como 3
            if not piece:
                continue
            prev = chords[-1] if chords else None
            near = prev is not None and x - prev[1] < 2.2 * body
            # «C m», «F 7»: la calidad quedó separada de la nota
            if prev and near and QUALITY_ONLY.match(piece) and re.fullmatch(rf'{NOTE}(?:#|b)?', prev[0]):
                chords[-1] = (prev[0] + piece, prev[1])
                continue
            # «#» o «b» sueltos del mismo tamaño
            if piece in ('#', 'b') and prev and near:
                m = re.match(NOTE, prev[0])
                chords[-1] = (prev[0][:m.end()] + piece + prev[0][m.end():], prev[1])
                continue
            parts = split_chords(piece)
            if parts is None:
                return None
            w = len(piece) * width / max(len(parts), 1)
            for k, p in enumerate(parts):
                chords.append((p, x + k * w))
    if not chords:
        return None
    # Los acordes junto a una etiqueta no salen del margen: no arrastran el desplazamiento.
    return ChordLine(ln.top, chords, prefix, suffix, ln.chars[0]['x0'], 1.0 if ln.beside_label else None)


def _acc_distance(a: dict, x: float, body: float) -> float:
    """
    Distancia entre un bemol/sostenido y la nota de un acorde que empieza en x.
    Suele ir justo detrás de la letra (A♭ → «A ᵇ») o, a veces, justo delante.
    """
    ac = (a['x0'] + a['x1']) / 2
    return min(abs(ac - (x + 0.9 * body)), abs(ac - (x - 0.35 * body)) + 0.15 * body)


def _scaled(cl: ChordLine, x: float, scale: float) -> float:
    return cl.origin + (x - cl.origin) * scale


def fit_scale(cl: ChordLine, accs: list[dict], body: float, default: float) -> float:
    best: tuple[float, float] | None = None
    for i in range(60, 126):
        sc = i / 100
        cost = sum(min(_acc_distance(a, _scaled(cl, x, sc), body) for _, x in cl.chords) for a in accs)
        key = (round(cost / max(len(accs), 1), 2), abs(sc - default))
        if best is None or key < best[0:2]:
            best = (key[0], key[1], sc)
    return best[2]


def attach_accidentals(chord_lines: list[ChordLine], accidentals: list[dict], body: float,
                       warnings: list[str], where: str, default_scale: float) -> None:
    """
    Los bemoles/sostenidos sueltos conservan su posición real; los acordes se
    desplazaron al convertir. Con ellos se calcula la corrección de cada línea
    y luego se pegan al acorde que les corresponde.
    """
    by_line: dict[int, list[dict]] = collections.defaultdict(list)
    for a in accidentals:
        ay = (a['top'] + a['bottom']) / 2
        cands = [cl for cl in chord_lines if -1.2 * body <= ay - cl.top <= 1.6 * body]
        if not cands:
            warnings.append(f'{where}: «{a["text"]}» suelto lejos de los acordes')
            continue
        cl = min(cands, key=lambda c: abs(ay - (c.top + 0.3 * body)))
        by_line[id(cl)].append(a)
    # Corrección de la página: se ajusta con todos sus signos sueltos a la vez
    # (una línea con un único signo no basta para saber cuánto se desplazó).
    lines_with = [(cl, by_line[id(cl)]) for cl in chord_lines if by_line.get(id(cl)) and cl.scale is None]
    page_scale = default_scale
    if lines_with:
        best = None
        for i in range(60, 126):
            sc = i / 100
            cost = sum(min(_acc_distance(a, _scaled(cl, x, sc), body) for _, x in cl.chords)
                       for cl, accs in lines_with for a in accs)
            key = (round(cost / sum(len(a) for _, a in lines_with), 2), abs(sc - default_scale))
            if best is None or key < best[0]:
                best = (key, sc)
        page_scale = best[1]
    for cl, accs in lines_with:
        if len(accs) >= 3:
            cl.scale = fit_scale(cl, accs, body, page_scale)
        else:
            # Algunas líneas (p. ej. con un solo acorde) no se desplazaron: se elige lo que mejor encaja.
            def cost(sc: float) -> float:
                return sum(min(_acc_distance(a, _scaled(cl, x, sc), body) for _, x in cl.chords) for a in accs)
            cl.scale = min((page_scale, 1.0), key=lambda sc: (round(cost(sc), 2), sc != page_scale))
    for cl in chord_lines:
        if cl.scale is None:
            cl.scale = page_scale
        accs = by_line.get(id(cl), [])
        pairs = sorted(
            ((_acc_distance(a, _scaled(cl, x, cl.scale), body), ai, ci)
             for ai, a in enumerate(accs) for ci, (_, x) in enumerate(cl.chords)),
        )
        used_a, used_c = set(), set()
        for d, ai, ci in pairs:
            if ai in used_a or ci in used_c or d > 1.6 * body:
                continue
            name, x = cl.chords[ci]
            m = re.match(NOTE, name)
            if not m or name[m.end():m.end() + 1] in ('#', 'b'):
                continue
            cl.chords[ci] = (name[:m.end()] + accs[ai]['text'] + LOOSE + name[m.end():], x)
            used_a.add(ai)
            used_c.add(ci)
        for ai, a in enumerate(accs):
            if ai not in used_a:
                warnings.append(f'{where}: «{a["text"]}» suelto sin acorde cercano')


VOWELS = set('aeiouáéíóúüAEIOUÁÉÍÓÚÜ')
WEAK = set('iuüIUÜ')  # «í» y «ú» con tilde cuentan como fuertes (rompen el diptongo)
CLUSTERS = {'pl', 'pr', 'bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'tr', 'ch', 'll', 'rr', 'tl'}


def _is_vowel(w: str, i: int) -> bool:
    ch = w[i]
    if ch in 'yY':
        return i == len(w) - 1 and i > 0  # «rey», «hoy»
    if ch in 'uU' and i > 0 and w[i - 1] in 'qgQG' and i + 1 < len(w) and w[i + 1] in 'eiéíEIÉÍ':
        return False  # que, qui, gue, gui: la u no suena
    return ch in VOWELS


def syllable_starts(text: str) -> list[int]:
    """Índices donde empieza cada sílaba (separación silábica del español, aproximada)."""
    starts: list[int] = []
    for m in re.finditer(r"[^\W\d_]+", text):
        w, base = m.group(0), m.start()
        starts.append(base)
        groups: list[list[int]] = []  # núcleos vocálicos
        for i in range(len(w)):
            if not _is_vowel(w, i):
                continue
            if groups and groups[-1][-1] == i - 1 and (w[i - 1] in WEAK or w[i] in WEAK or w[i] in 'yY'):
                groups[-1].append(i)  # diptongo
            else:
                groups.append([i])
        for g1, g2 in zip(groups, groups[1:]):
            a, b = g1[-1] + 1, g2[0]
            cons = w[a:b].lower()
            if not cons:
                cut = b
            elif cons.endswith('u'):
                cut = b - 2  # «qu» / «gu» van juntas: a-quí, tran-qui-lo
            elif len(cons) == 1:
                cut = a
            elif cons[-2:] in CLUSTERS:
                cut = b - 2
            else:
                cut = b - 1
            starts.append(base + cut)
    return sorted(set(starts))


def merge(cl: ChordLine, lyric: Line) -> str:
    chars = lyric.chars
    while chars and chars[-1]['text'].isspace():
        chars = chars[:-1]
    text = ''.join(c['text'] for c in chars)
    if not text:
        return chord_only(cl)
    origin = cl.origin
    onsets = syllable_starts(text) or [0]
    last = onsets[-1]
    inserts: dict[int, list[str]] = collections.defaultdict(list)
    beyond = 0
    for name, x in cl.chords:
        x = origin + (x - origin) * (cl.scale or 1.0)
        if x >= chars[-1]['x1']:
            # más allá del final: el primero a la última sílaba, el resto detrás de la letra
            idx = last if beyond == 0 and last not in inserts else len(text)
            beyond += 1
        else:
            idx = min(onsets, key=lambda i: abs(chars[i]['x0'] - x))
        inserts[idx].append(name)
    out = []
    for i in range(len(text) + 1):
        if i in inserts:
            if i == len(text):
                out.append(' ')
            out.append(''.join(f'[{n}]' for n in inserts[i]))
        if i < len(text):
            out.append(text[i])
    return cl.prefix + ''.join(out).strip() + cl.suffix


def chord_only(cl: ChordLine) -> str:
    return cl.prefix + ' '.join(f'[{n}]' for n, _ in cl.chords) + cl.suffix


def slug(s: str) -> str:
    s = unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:60]


@dataclass
class Hymn:
    number: int | None
    title: str
    credits: list[str] = field(default_factory=list)
    body: list[str] = field(default_factory=list)
    pages: list[int] = field(default_factory=list)


def convert(pdf_path: Path, warnings: list[str], scale: float = 0.85) -> list[Hymn]:
    hymns: list[Hymn] = []
    current: Hymn | None = None
    with pdfplumber.open(pdf_path) as pdf:
        for pno, page in enumerate(pdf.pages, 1):
            lines, accidentals, body = page_lines(page)
            if not lines:
                continue
            def is_title(ln: Line) -> bool:
                return ln.size >= 1.6 * body and ln.bold > 0.5 and not re.fullmatch(r'\d+', ln.text.strip())

            def musical(ln: Line) -> bool:
                # etiquetas («Introducción») y líneas de acordes van con el himno aunque sean pequeñas
                return bool(LABEL_RE.match(ln.text)) or as_chord_line(ln) is not None

            def is_body(ln: Line) -> bool:
                return not is_title(ln) and (0.82 * body <= ln.size <= 1.3 * body or (0.55 * body <= ln.size and musical(ln)))

            # Los acordes y sus alteraciones se resuelven para toda la página.
            chord_lines = {id(ln): as_chord_line(ln) for ln in lines if is_body(ln)}
            attach_accidentals([c for c in chord_lines.values() if c], accidentals, body, warnings, f'pág. {pno}', scale)

            # Una página puede tener varios himnos: se corta en cada título «N. …».
            starts = [i for i, ln in enumerate(lines) if is_title(ln) and re.match(r'^\s*\d+\s*\.', ln.text)]
            bounds = [0] + starts + [len(lines)]
            for seg_start, seg_end in zip(bounds, bounds[1:]):
                seg = lines[seg_start:seg_end]
                if not seg:
                    continue
                title_lines: list[Line] = []
                if seg_start in starts:
                    k = 0
                    while k < len(seg) and is_title(seg[k]):
                        title_lines.append(seg[k])
                        k += 1
                    title = ' '.join(ln.text.strip() for ln in title_lines)
                    m = re.match(r'^\s*(\d+)\s*\.\s*(.*)$', title)
                    current = Hymn(int(m.group(1)), re.sub(r'\s+', ' ', m.group(2)).strip())
                    hymns.append(current)
                elif current is None:
                    continue  # portada, prefacio, índice
                if pno not in current.pages:
                    current.pages.append(pno)
                body_lines = [ln for ln in seg if is_body(ln)]
                if title_lines:
                    first_body = min((b.top for b in body_lines), default=float('inf'))
                    for ln in seg:
                        if ln not in body_lines and ln not in title_lines and 0.55 * body <= ln.size < 0.82 * body \
                                and ln.top < first_body + 1:
                            current.credits.append(re.sub(r'\s+', ' ', ln.text).strip())
                process_body(current, body_lines, chord_lines, body)
    return hymns


def process_body(current: 'Hymn', body_lines: list[Line], chord_lines: dict, body: float) -> None:
    i = 0
    pending_label: str | None = None
    while i < len(body_lines):
        ln = body_lines[i]
        cl = chord_lines[id(ln)]
        text = re.sub(r'\s+', ' ', ln.text).strip()
        if cl:
            nxt = body_lines[i + 1] if i + 1 < len(body_lines) else None
            nxt_text = re.sub(r'\s+', ' ', nxt.text).strip() if nxt is not None else ''
            if nxt is not None and not chord_lines[id(nxt)] and not SECTION_RE.match(nxt_text) \
                    and not LABEL_RE.match(nxt_text) and not nxt_text.startswith('*') \
                    and nxt.top - ln.top < 2.2 * body:
                if pending_label:
                    current.body.append(f'{{c: {pending_label}}}')
                    pending_label = None
                current.body.append(merge(cl, nxt))
                i += 2
                continue
            line = chord_only(cl)
            if pending_label:
                current.body.append(f'{{c: {pending_label}}}')
                pending_label = None
            current.body.append(line)
            i += 1
            continue
        # notas al pie («*Capo en 2° traste…»), que pueden seguir en la línea de abajo
        if text.startswith('*'):
            note = text.lstrip('* ')
            while i + 1 < len(body_lines) and not chord_lines[id(body_lines[i + 1])]:
                cont = re.sub(r'\s+', ' ', body_lines[i + 1].text).strip()
                if not cont[:1].islower():
                    break
                note += ' ' + cont
                i += 1
            current.body.append(f'{{c: Nota: {note}}}')
            i += 1
            continue
        # etiquetas con acordes al lado: «Final G», «Introducción A E D» (o «Fin a l A B E»)
        m = re.match(r'^(Introducci[oó]n|Intro|F\s?i\s?n\s?a\s?l|Intermedio)\s+(.+)$', text, re.I)
        if m and all(split_chords(t) for t in m.group(2).split()):
            current.body.append(f'{{c: {m.group(1).replace(" ", "").capitalize()}}}')
            current.body.append(' '.join(f'[{c}]' for t in m.group(2).split() for c in split_chords(t)))
            i += 1
            continue
        if m and split_chords(m.group(2).replace(' ', '')):
            current.body.append(f'{{c: {m.group(1).capitalize()}}}')
            current.body.append(' '.join(f'[{c}]' for c in m.group(2).split()))
            i += 1
            continue
        s = SECTION_RE.match(text)
        if s:
            if s.group('num'):
                current.body.append(f'§verse {s.group("num")}')
            elif s.group('coro'):
                current.body.append(f'§chorus {title_case(text) if text.isupper() else text}')
            else:
                pending_label = text.capitalize()
                # si la etiqueta no lleva acordes debajo, se escribe tal cual
                nxt = body_lines[i + 1] if i + 1 < len(body_lines) else None
                if nxt is None or not chord_lines[id(nxt)]:
                    current.body.append(f'{{c: {pending_label}}}')
                    pending_label = None
            i += 1
            continue
        if pending_label:
            current.body.append(f'{{c: {pending_label}}}')
            pending_label = None
        current.body.append(text)
        i += 1


BRACKET_RE = re.compile(r'\[([^\]]+)\]')
LOOSE = '\u2063'  # marca interna: alteración recuperada de un signo suelto
INVALID = {'E#': 'E', 'B#': 'B', 'Fb': 'F', 'Cb': 'C'}


def normalize_accidentals(h: Hymn, warnings: list[str], guess: bool = True) -> None:
    """
    Revisión musical de los bemoles/sostenidos recolocados:
    - grafías imposibles en este tipo de himnos (E#, B#, Fb, Cb) → nota natural;
    - si una nota aparece casi siempre alterada en el himno (10×E♭ y 1×E),
      la natural suelta se corrige (sólo con guess=True: en un PDF original las
      alteraciones están en su sitio y estas «correcciones» romperían acordes
      prestados como el F de «F G A» en La).
    """
    def root(ch: str) -> tuple[str, str]:
        m = re.match(r'([A-G])([#b]?)', ch)
        return (m.group(1), m.group(2)) if m else ('', '')

    def loose(ch: str) -> bool:
        return LOOSE in ch

    counts: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    loose_letters: set[str] = set()
    for line in h.body:
        for ch in BRACKET_RE.findall(line):
            if LOOSE in ch:
                loose_letters.add(ch[0])
            letter, acc = root(ch)
            if letter and letter + acc not in INVALID:
                counts[letter][acc] += 1
    fixes: dict[str, str] = {}
    for letter, c in (counts.items() if guess else []):
        for acc in ('b', '#'):
            if c[acc] >= 2 and c[acc] >= 2 * c[''] and c[''] > 0:
                fixes[letter] = acc
    changes: collections.Counter = collections.Counter()

    def fix(m: re.Match) -> str:
        ch = m.group(1)
        letter, acc = root(ch)
        clean = ch.replace(LOOSE, '')
        if not letter:
            return m.group(0)
        rest = clean[len(letter) + len(acc):]
        new = clean
        if letter + acc in INVALID:
            new = INVALID[letter + acc] + rest
        elif acc == '' and letter in fixes:
            new = letter + fixes[letter] + rest
        elif guess and acc and loose(ch) and counts[letter][''] >= 3 and counts[letter][acc] <= max(1, counts[letter][''] // 4):
            new = letter + rest  # signo suelto mal asignado: la nota va natural en todo el himno
        if new != clean:
            changes[f'{clean}→{new}'] += 1
        return f'[{new}]'

    h.body = [BRACKET_RE.sub(fix, line) if not line.startswith(('{', '§')) else line for line in h.body]
    # Notas que siguen apareciendo con y sin alteración: que lo revise una persona.
    final: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    for line in h.body:
        if line.startswith(('{', '§')):
            continue
        for ch in BRACKET_RE.findall(line):
            letter, acc = root(ch)
            if letter:
                final[letter][acc] += 1
    for letter, c in sorted(final.items()):
        for acc in ('#', 'b'):
            if c[acc] >= 2 and c[''] >= 2 and letter in loose_letters:
                warnings.append(f'Himno {h.number} «{h.title}»: revisar {letter}/{letter}{acc} '
                                f'({c[acc]} con «{acc}», {c[""]} sin): puede faltar o sobrar una alteración')
    if changes:
        detail = ', '.join(f'{k} ({v})' if v > 1 else k for k, v in changes.items())
        warnings.append(f'Himno {h.number} «{h.title}»: alteraciones corregidas por coherencia: {detail}')


PROPER = {'dios', 'cristo', 'jesús', 'jesus', 'jesucristo', 'jehová', 'jehova', 'señor', 'espíritu', 'santo',
          'iglesia', 'padre', 'rey', 'salvador', 'israel', 'sion', 'sión', 'jerusalén', 'emanuel', 'mesías', 'biblia'}


def title_case(t: str) -> str:
    """«VIVE CRISTO EN MÍ» → «Vive Cristo en mí» (mayúscula inicial y en los nombres de Dios)."""
    if not t.isupper():
        return t
    words = t.lower().split(' ')
    out = []
    for i, w in enumerate(words):
        core = w.strip('¡!¿?.,;:"()')
        if i == 0 or core in PROPER or re.fullmatch(r'[ivx]+', core):
            idx = w.find(core) if core else 0
            w = w[:idx] + (core.upper() if re.fullmatch(r'[ivx]+', core) and i > 0 else core[:1].upper() + core[1:]) + w[idx + len(core):]
        out.append(w)
    return ' '.join(out)


NOTE_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
SHARP_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']


def _chord_pc(ch: str) -> tuple[int, bool] | None:
    m = re.match(r'([A-G])([#b]?)(.*)', ch)
    if not m:
        return None
    pc = (NOTE_PC[m.group(1)] + {'#': 1, 'b': -1, '': 0}[m.group(2)]) % 12
    minor = bool(re.match(r'm(?!aj)', m.group(3)))
    return pc, minor


def guess_key(h: Hymn) -> str | None:
    """
    Tono del himno: el que reúne más acordes propios de la tonalidad
    (I, ii, iii, IV, V, vi en mayor; i, III, iv, v/V, VI, VII en menor).
    El acorde final y el inicial suman puntos extra (deciden entre Do mayor y La menor).
    """
    chords = [c for line in h.body if not line.startswith(('{', '§')) for c in BRACKET_RE.findall(line)]
    all_parsed = [p for p in (_chord_pc(c) for c in chords) if p]
    if not all_parsed:
        return None
    last, first = all_parsed[-1], all_parsed[0]
    # los acordes con séptima suelen ser dominantes secundarias (G#7 en Mi): no cuentan
    parsed = [p for c, p in zip(chords, (_chord_pc(c) for c in chords)) if p and '7' not in c] or all_parsed
    best = None
    for tonic in range(12):
        for minor in (False, True):
            if minor:
                degrees = {(0, True), (3, False), (5, True), (7, True), (7, False), (8, False), (10, False)}
            else:
                degrees = {(0, False), (2, True), (4, True), (5, False), (7, False), (9, True)}
            score = sum(((pc - tonic) % 12, mi) in degrees for pc, mi in parsed)
            # el acorde con que termina (y empieza) el himno pesa mucho: suele ser el tono
            score += 4 * ((tonic, minor) == last) + 2 * ((tonic, minor) == first)
            key = (score, (tonic, minor) == last, not minor)
            if best is None or key > best[0]:
                best = (key, tonic, minor)
    _, tonic, minor = best
    return SHARP_NAMES[tonic] + ('m' if minor else '')


def to_chordpro(h: Hymn, book: str) -> str:
    out = [f'{{title: {title_case(h.title)}}}']
    if h.number is not None:
        out.append(f'{{number: {h.number}}}')
    key = guess_key(h)
    if key:
        out.append(f'{{key: {re.match(r"[A-G][#b]?m?", key).group(0) if re.match(r"[A-G]", key) else key}}}')
    if h.credits:
        out.append(f'{{author: {" · ".join(h.credits)}}}')
    out.append(f'# {book}')
    out.append('')
    in_chorus = False
    started = False
    for line in h.body:
        if line.startswith('§'):
            kind, label = line[1:].split(' ', 1)
            if in_chorus:
                out.append('{eoc}')
                in_chorus = False
            if started:
                out.append('')
            if kind == 'verse':
                out.append(f'{{c: Estrofa {label}}}')
            else:
                out.append(f'{{soc: {label}}}')
                in_chorus = True
            started = True
            continue
        if line.startswith('{c:') and started:
            if in_chorus:
                out.append('{eoc}')
                in_chorus = False
            out.append('')
        out.append(line)
        started = True
    if in_chorus:
        out.append('{eoc}')
    return '\n'.join(out).rstrip() + '\n'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('pdf', type=Path)
    ap.add_argument('salida', type=Path)
    ap.add_argument('--id', required=True, help='identificador corto del himnario (p. ej. juvenil)')
    ap.add_argument('--nombre', required=True, help='nombre que verán los usuarios')
    ap.add_argument('--descripcion', default=None)
    ap.add_argument('--original', action='store_true',
                    help='PDF original (no salido de una conversión): acordes en su sitio, sin corregir desplazamientos '
                         'ni adivinar alteraciones')
    ap.add_argument('--escala', type=float, default=0.85,
                    help='corrección del espaciado de los acordes (1 = tal cual; 0.85 va bien con PDFs salidos de Word)')
    args = ap.parse_args()

    warnings: list[str] = []
    hymns = convert(args.pdf, warnings, 1.0 if args.original else args.escala)
    args.salida.mkdir(parents=True, exist_ok=True)
    seen = collections.Counter(h.number for h in hymns)
    for h in hymns:
        normalize_accidentals(h, warnings, guess=not args.original)
        if not any('[' in l for l in h.body):
            warnings.append(f'Himno {h.number} «{h.title}»: no se encontraron acordes')
        if seen[h.number] > 1:
            warnings.append(f'Himno {h.number} aparece {seen[h.number]} veces')
        name = f'{h.number:03d}-{slug(h.title)}.cho' if h.number is not None else f'{slug(h.title)}.cho'
        (args.salida / name).write_text(to_chordpro(h, args.nombre), encoding='utf-8')
    # Todo el himnario en un solo archivo ChordPro ({new_song} separa los himnos),
    # para importarlo desde la app.
    combined = f'{{x_himnario: {args.nombre}}}\n' + '\n{new_song}\n'.join(to_chordpro(h, args.nombre) for h in hymns)
    (args.salida / f'{args.id}.chopro').write_text(combined, encoding='utf-8')
    (args.salida / 'himnario.json').write_text(json.dumps(
        {'id': args.id, 'name': args.nombre, 'description': args.descripcion}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    nums = sorted(h.number for h in hymns if h.number is not None)
    missing = [n for n in range(1, (nums[-1] if nums else 0) + 1) if n not in nums]
    if missing:
        warnings.append(f'Números que faltan: {missing}')
    (args.salida / 'revision.txt').write_text('\n'.join(warnings) + '\n', encoding='utf-8')
    print(f'{len(hymns)} himnos convertidos en {args.salida} · {len(warnings)} avisos (ver revision.txt)')


if __name__ == '__main__':
    main()

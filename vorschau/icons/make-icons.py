#!/usr/bin/env python3
"""Erzeugt die App-Icons der Vorschau: ein weißer Bildschirm (Hochformat) mit
vier dunklen Fenstern (2 × 2) auf #1B1B1B — Deine Apps in klein.

Bewusst anders als das Dashboard (vier weiße Quadrate), damit sich die beiden
auf dem Homescreen nicht verwechseln lassen.

Nur zum Neuerzeugen der Icons nötig, nicht für die App selbst.
Braucht Python 3 und Pillow:  python3 icons/make-icons.py

#1B1B1B ist das Grau der dunklen Homescreen-Icons (Bauanleitung 5.14) und
muss zu background_color in manifest.webmanifest passen, sonst zeichnet sich
beim Start der App ein Quadrat ab.

Die Geometrie steht genau einmal in motif(). Daraus entstehen die PNGs (mit
Pillow, groß gezeichnet und verkleinert) und icon.svg als Vektorvorlage.
"""
from pathlib import Path
from PIL import Image, ImageDraw

BG = '#1B1B1B'
FG = '#FFFFFF'
SS = 4                     # Überabtastung: groß zeichnen, verkleinern = glatte Kanten
OUT = Path(__file__).resolve().parent


def motif(size, scale):
    """Bildschirm und Fenster als (x, y, Breite, Höhe, Radius, Farbe).
    scale: Höhe des Bildschirms als Anteil der Kantenlänge."""
    h = size * scale
    w = h * .64                        # Hochformat wie ein Handy
    x0, y0 = (size - w) / 2, (size - h) / 2
    pad = w * .15
    gap = w * .09
    cw = (w - 2 * pad - gap) / 2
    ch = (h - 2 * pad - gap) / 2
    shapes = [(x0, y0, w, h, w * .17, FG)]
    shapes += [(x0 + pad + cx * (cw + gap), y0 + pad + cy * (ch + gap), cw, ch, cw * .22, BG)
               for cy in (0, 1) for cx in (0, 1)]
    return shapes


def png(size, scale):
    S = size * SS
    img = Image.new('RGB', (S, S), BG)
    d = ImageDraw.Draw(img)
    for x, y, w, h, r, c in motif(S, scale):
        d.rounded_rectangle((x, y, x + w, y + h), radius=r, fill=c)
    return img.resize((size, size), Image.LANCZOS)


def svg(size, scale):
    rects = ''.join(
        f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" rx="{r:.2f}" fill="{c}"/>'
        for x, y, w, h, r, c in motif(size, scale))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">'
            f'<rect width="{size}" height="{size}" fill="{BG}"/>{rects}</svg>\n')


# Das Motiv soll so groß wirken wie die Symbole der anderen Apps (Bauanleitung
# 5.14). Es ist schmaler als hoch, deshalb gilt die Höhe: im "any"-Icon 52 %
# (Breite gut 33 %), im maskable-Icon 38 % (Breite knapp 25 %) — Android zeigt
# davon einen Kreis von gut 85 % der Kantenlänge.
png(192, .52).save(OUT / 'icon-192.png', optimize=True)
png(512, .52).save(OUT / 'icon-512.png', optimize=True)
png(512, .38).save(OUT / 'icon-maskable-512.png', optimize=True)
(OUT / 'icon.svg').write_text(svg(512, .52), encoding='utf-8')
print('Icons geschrieben nach', OUT)

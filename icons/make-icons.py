#!/usr/bin/env python3
"""Erzeugt die App-Icons: vier weiße, abgerundete Quadrate (2 × 2) auf #1B1B1B.

Nur zum Neuerzeugen der Icons nötig, nicht für die App selbst.
Braucht Python 3 und Pillow:  python3 icons/make-icons.py

#1B1B1B ist das Grau der dunklen Homescreen-Icons (Bauanleitung 5.14) und
muss zu background_color in manifest.webmanifest passen, sonst zeichnet sich
beim Start der App ein Quadrat ab.

Die Geometrie steht genau einmal in motif(). Daraus entstehen die PNGs (mit
Pillow, groß gezeichnet und verkleinert) und icon.svg als Vektorvorlage — so
bleiben beide garantiert gleich.
"""
from pathlib import Path
from PIL import Image, ImageDraw

BG = '#1B1B1B'
FG = '#FFFFFF'
SS = 4                     # Überabtastung: groß zeichnen, verkleinern = glatte Kanten
OUT = Path(__file__).resolve().parent


def motif(size, scale):
    """Rechtecke (x, y, Kante, Radius) des Motivs.
    scale: Breite des ganzen Motivs als Anteil der Kantenlänge."""
    w = size * scale
    cell = w * .43                     # zwei Zellen + Fuge = ganze Breite
    gap = w - 2 * cell
    r = cell * .30
    x0 = (size - w) / 2
    return [(x0 + cx * (cell + gap), x0 + cy * (cell + gap), cell, r)
            for cy in (0, 1) for cx in (0, 1)]


def png(size, scale):
    S = size * SS
    img = Image.new('RGB', (S, S), BG)
    d = ImageDraw.Draw(img)
    for x, y, c, r in motif(S, scale):
        d.rounded_rectangle((x, y, x + c, y + c), radius=r, fill=FG)
    return img.resize((size, size), Image.LANCZOS)


def svg(size, scale):
    rects = ''.join(
        f'<rect x="{x:.2f}" y="{y:.2f}" width="{c:.2f}" height="{c:.2f}" rx="{r:.2f}"/>'
        for x, y, c, r in motif(size, scale))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">'
            f'<rect width="{size}" height="{size}" fill="{BG}"/>'
            f'<g fill="{FG}">{rects}</g></svg>\n')


# Das Motiv soll so groß wirken wie die Symbole der anderen Apps auf dem
# Homescreen. "maskable": Android zeigt davon einen Kreis von gut 85 % der
# Kantenlänge, 32 % Motivbreite wirken dort wie die Systemsymbole.
# "any" (Favicon, Chrome-Dialoge) ist ganz sichtbar, deshalb 45 %.
png(192, .45).save(OUT / 'icon-192.png', optimize=True)
png(512, .45).save(OUT / 'icon-512.png', optimize=True)
png(512, .32).save(OUT / 'icon-maskable-512.png', optimize=True)
(OUT / 'icon.svg').write_text(svg(512, .45), encoding='utf-8')
print('Icons geschrieben nach', OUT)

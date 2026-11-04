#!/usr/bin/env python3
"""Render the approved vector direction. Requires librsvg and ImageMagick."""
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET

ASSETS = Path(__file__).resolve().parents[1] / 'assets'
DIRECTIONS = ASSETS / 'icon-directions'
BACKGROUND = '#FBFBFA'
INK = '#292D29'


def mark(name):
    root = ET.parse(DIRECTIONS / f'{name}.svg').getroot()
    # The first element is the presentation background, not part of the mark.
    return ''.join(ET.tostring(child, encoding='unicode') for child in list(root)[1:])


def document(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">{body}</svg>'


def scaled(body, factor):
    return f'<g transform="translate(512 512) scale({factor}) translate(-512 -512)">{body}</g>'


def render(path, source, size=1024, opaque=False):
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), '-o', str(path)], input=source.encode(), check=True)
    if opaque:
        subprocess.run(['magick', str(path), '-alpha', 'off', f'PNG24:{path}'], check=True)


background = f'<rect width="1024" height="1024" fill="{BACKGROUND}"/>'
selected = mark('timeline')
render(ASSETS / 'icon.png', document(background + scaled(selected, 1.36)), opaque=True)
render(ASSETS / 'android-icon-foreground.png', document(selected))
render(ASSETS / 'android-icon-background.png', document(background), opaque=True)
render(ASSETS / 'android-icon-monochrome.png', document(selected.replace('#A6B69E', INK)))
render(ASSETS / 'splash-icon.png', document(scaled(selected, 1.36)))
for name in ('timeline', 'interval'):
    source = document(background + scaled(mark(name), 1.36))
    for size in (24, 48, 1024):
        render(DIRECTIONS / f'{name}-{size}.png', source, size, opaque=True)

# The comparison uses actual-size 24/48px images and a larger overview.
parts = ['<rect width="1000" height="600" fill="#E8EAE4"/>']
for x, name, title in ((48, 'timeline', 'A · Timeline'), (548, 'interval', 'B · Interval')):
    body = background + scaled(mark(name), 1.36)
    parts.append(f'<text x="{x}" y="52" font-family="Helvetica, sans-serif" font-size="22" fill="{INK}">{title}</text>')
    for dx, y, size in ((0, 80, 358), (0, 480, 24), (64, 468, 48)):
        parts.append(f'<g transform="translate({x + dx} {y}) scale({size / 1024})">{body}</g>')
    parts.append(f'<g font-family="Helvetica, sans-serif" font-size="14" fill="#747970"><text x="{x}" y="554">24 px</text><text x="{x + 64}" y="554">48 px</text></g>')
comparison = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600" viewBox="0 0 1000 600">' + ''.join(parts) + '</svg>'
(DIRECTIONS / 'comparison.svg').write_text(comparison)
subprocess.run(['rsvg-convert', str(DIRECTIONS / 'comparison.svg'), '-o', str(DIRECTIONS / 'comparison.png')], check=True)

# Static mask previews are useful for review; they do not replace OS acceptance.
mask_parts = [
    '<rect width="960" height="360" fill="#E8EAE4"/>',
    '<defs><clipPath id="circle"><circle cx="512" cy="512" r="341"/></clipPath>',
    '<clipPath id="rounded"><rect x="171" y="171" width="682" height="682" rx="150"/></clipPath></defs>',
]
for x, clip, mono, label in ((0, 'circle', False, 'Circle'), (320, 'rounded', False, 'Rounded square'), (640, 'circle', True, 'Themed silhouette')):
    artwork = selected.replace('#A6B69E', INK) if mono else selected
    mask_parts.append(f'<g transform="translate({x + 6} -4) scale(.3)"><g clip-path="url(#{clip})">{background}{artwork}</g></g>')
    mask_parts.append(f'<text x="{x + 48}" y="320" font-family="Helvetica, sans-serif" font-size="18" fill="{INK}">{label}</text>')
mask_svg = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="360" viewBox="0 0 960 360">' + ''.join(mask_parts) + '</svg>'
(DIRECTIONS / 'masks.svg').write_text(mask_svg)
subprocess.run(['rsvg-convert', str(DIRECTIONS / 'masks.svg'), '-o', str(DIRECTIONS / 'masks.png')], check=True)

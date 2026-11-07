"""Renders printed pages of a book PDF to WebP images (called by scripts/book-pages.ts).

usage: python -I book-pages.py <book.pdf> <first page> <last page> <pdf offset> <out dir>

Pages are printed page numbers; the PDF page is printed + offset. Each page becomes
<out dir>/<page, 3 digits>.webp: grayscale (the book is black and white), 1400 px wide,
about 30 KB. Needs Python 3 with pypdfium2 and Pillow.
"""

import os
import sys

import pypdfium2 as pdfium

WIDTH = 1400
QUALITY = 75

pdf_path, first, last, offset, out = sys.argv[1], *map(int, sys.argv[2:5]), sys.argv[5]
os.makedirs(out, exist_ok=True)
pdf = pdfium.PdfDocument(pdf_path)
if last + offset > len(pdf):
    raise SystemExit(f'the PDF has {len(pdf)} pages; printed page {last} would be page {last + offset}')

book_time = os.path.getmtime(pdf_path)
rendered = 0
for printed in range(first, last + 1):
    path = os.path.join(out, f'{printed:03d}.webp')
    # Already rendered from this copy of the book: keep it (a second run only uploads).
    if os.path.exists(path) and os.path.getmtime(path) > book_time:
        continue
    page = pdf[printed + offset - 1]
    width, _ = page.get_size()
    image = page.render(scale=WIDTH / width).to_pil().convert('L')
    image.save(path, 'WEBP', quality=QUALITY, method=6)
    page.close()
    rendered += 1
print(f'printed pages {first}-{last} in {out} ({rendered} rendered, the rest already there)')

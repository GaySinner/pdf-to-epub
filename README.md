# PDF to EPUB

A small static web page that converts a comic or manga PDF into a fixed-layout EPUB for Kindle. It runs entirely in the browser: the PDF is never uploaded anywhere, so it works on GitHub Pages with no server.

## How it works

1. [pdf.js](https://github.com/mozilla/pdf.js) renders each PDF page onto a canvas at your chosen height.
2. Each page is exported as a JPEG (optionally grayscale).
3. [JSZip](https://stuk.github.io/jszip/) packages the images into an EPUB 3 with fixed layout and a right-to-left or left-to-right page order.
4. The browser downloads the finished file.

Pages are processed one at a time, so large PDFs work, though a phone may be slow on 200+ pages.

## Options

| Option | Notes |
| --- | --- |
| Reading direction | Right to left for manga, left to right for western comics |
| Page height | 1100 px (small), 1400 px (balanced), 1800 px (sharp, large) |
| JPEG quality | Lower is smaller. 60 to 70 is a good range for black-and-white pages |
| Grayscale | Shrinks the file a lot for black-and-white manga. Turn it off for color |

Amazon's Send to Kindle accepts files up to 200 MB. If the result is bigger, lower the page height or quality.

## Publish on GitHub Pages

```bash
git init
git add .
git commit -m "PDF to EPUB converter"
gh repo create pdf-to-epub --public --source=. --push
```

Then in the repo on GitHub: **Settings, Pages, Build and deployment, Source: Deploy from a branch, Branch: main, folder: / (root), Save.**
After a minute the site is live at `https://<your-username>.github.io/pdf-to-epub/`.

## Run locally

The page uses ES modules, so open it through a local server rather than by double-clicking:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Notes

- Some PDFs store pages as JPEG 2000 images. The `lib/wasm/` folder holds the decoder pdf.js needs for them, so keep it.
- `lib/` contains vendored copies of pdf.js (legacy build, Apache-2.0) and JSZip (MIT or GPL-3.0), so the site has no CDN dependency.
- Only convert files you have the right to use. This tool is meant for personal format-shifting of PDFs you own.

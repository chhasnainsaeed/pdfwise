# PDFwise

A free PDF toolkit: pick a tool, drop your files, adjust options, download the result.
The PDF tools run entirely in the browser with [pdf-lib](https://pdf-lib.js.org/),
[PDF.js](https://mozilla.github.io/pdf.js/), [qpdf](https://qpdf.sourceforge.io/) (WebAssembly),
[Tesseract.js](https://tesseract.projectnaptha.com/) and [docx](https://docx.js.org/), so those files
are never uploaded. (OCR downloads its language model from a CDN on first use.) Only Office → PDF and
HTML → PDF use a server, which you run yourself.

## Run it

```bash
npm install
npm run dev        # app at http://localhost:5173
npm run server     # conversion server at http://127.0.0.1:3001 (Office → PDF and HTML → PDF only)
```

The dev server proxies `/api` to the conversion server. For production, `npm start` builds the app
and serves it together with the API from one Node process on port 3001.

### Build for search engines

`npm run build` runs [scripts/prerender.mjs](scripts/prerender.mjs) after Vite. It writes one HTML file per
page (home, every tool and the “Compress PDF to 100 KB / 200 KB / 500 KB / 1 MB / 2 MB” pages), each
with its own title, meta description, Open Graph tags, JSON-LD (`WebApplication`, `FAQPage`,
`BreadcrumbList`) and readable content. It also writes `robots.txt`. Set your public address so it can
add canonical URLs and `sitemap.xml`:

```bash
SITE_URL=https://your-domain.com npm run build
```

The page copy (titles, keywords, how-to steps, FAQs) lives in [src/seo.js](src/seo.js). The Node server
serves `dist/<page>.html` at `/<page>` and answers unknown paths with a 404. Static hosts such as Netlify,
Vercel and Cloudflare Pages do the same with clean URLs.

### Conversion server

[server/index.js](server/index.js) is a small Express server with two Office converters:

- **LibreOffice** (best fidelity, every format) when it's installed: `winget install
  TheDocumentFoundation.LibreOffice`, `brew install --cask libreoffice`, or `apt install
  libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress`. Set `SOFFICE_PATH` if it's
  somewhere unusual.
- **Built-in converter**, used automatically otherwise. It needs nothing beyond `npm install` and a
  Chrome or Edge browser (Edge ships with Windows). Documents are turned into HTML
  ([server/office/](server/office)) and printed to PDF by that browser through
  [puppeteer-core](https://pptr.dev/):

  | Format | How | What carries over |
  | --- | --- | --- |
  | DOCX | [docx-preview](https://github.com/VolodymyrBaydalka/docxjs) inside the print page | Fonts, sizes, colors, alignment, tables, images, page size/margins, page breaks |
  | DOC (97–2003) | [word-extractor](https://github.com/morungos/node-word-extractor) | Text only |
  | ODT | built-in OpenDocument reader | Styles, headings, lists, tables, images, page size |
  | RTF | built-in RTF reader | Fonts, colors, styles, alignment, tables, PNG/JPEG pictures, page size |
  | XLSX | [ExcelJS](https://github.com/exceljs/exceljs) styles + [SheetJS](https://sheetjs.com/) number formats | Fonts, fills, borders, alignment, merged cells, widths/heights, orientation |
  | XLS, ODS, CSV | SheetJS | Values and formatting, one section per sheet |
  | PPTX | built-in renderer | Layouts/masters, theme colors, text, shapes, pictures, tables, charts (bar/column/line/area/pie/doughnut/scatter), SmartArt |
  | ODP | built-in renderer | Text frames, shapes, images, backgrounds |

  PPT (binary PowerPoint) needs LibreOffice.

HTML → PDF loads the page in the same headless browser, scrolls it so lazy images load, and prints it.
All of the browser's traffic goes through a local egress proxy ([server/egress-proxy.js](server/egress-proxy.js))
that resolves each host itself, refuses localhost, private, link-local and `.local` addresses and
non-web ports, and connects to the exact IP it checked — so DNS rebinding can't sneak a request onto
your network. `ALLOW_PRIVATE_URLS=1` lifts the block (for intranet pages).

Uploads go to a fresh temp folder (LibreOffice) or stay in memory (built-in) and are discarded after
conversion. The server listens on 127.0.0.1 by default; set `BASIC_AUTH` before exposing it.

| Setting | Default | |
| --- | --- | --- |
| `PORT`, `HOST` | `3001`, `127.0.0.1` | |
| `BASIC_AUTH` | off | `user:password` — protects the app and API with HTTP Basic auth |
| `RATE_LIMIT_PER_MIN` | `30` | conversions per client IP per minute (`0` turns it off) |
| `TRUST_PROXY` | off | Express `trust proxy` value when running behind a reverse proxy |
| `CONVERTER` | `auto` | `libreoffice` or `builtin` to force one |
| `SOFFICE_PATH`, `CHROME_PATH` | auto-detected | |
| `MAX_UPLOAD_MB` | `100` | |
| `CONVERT_TIMEOUT_S` | `120` | |
| `CONVERT_CONCURRENCY` | `2` | parallel LibreOffice instances |
| `BROWSER_CONCURRENCY` | `3` | parallel browser pages |
| `ALLOW_PRIVATE_URLS` | off | let HTML → PDF fetch local-network pages |

| Endpoint | |
| --- | --- |
| `GET /api/health` | `{ ok, engine, formats, notes, libreoffice, browser, maxUploadMb }` |
| `POST /api/convert/pdf` | Raw file body + `X-File-Name` header (URL-encoded) → `application/pdf`, or `{ error }` with 400/413/415/422/429/503/504 |
| `POST /api/convert/url` | JSON `{ url, format: "A4"\|"Letter", landscape, margin: "none"\|"small"\|"normal", background, screen }` → `application/pdf` |

## Tools

| Tool | What it does |
| --- | --- |
| Merge PDF | Join several PDFs; drag cards or use the arrows to order them |
| Split PDF | Custom ranges (optionally merged), fixed-size chunks, or one file per page |
| Remove pages / Extract pages | Click, shift-click or type page lists like `1, 3-5, 9` |
| Organize PDF | Drag-reorder, rotate or delete individual pages, mix pages from several PDFs |
| Compress PDF | Re-encodes embedded JPEG/raw images as smaller JPEGs; text and vectors stay intact |
| Repair PDF | Rebuilds damaged files (qpdf, falling back to pdf-lib's object scan for broken xref tables) |
| OCR PDF | Tesseract OCR in 22 languages (Latin, Cyrillic, Greek, Arabic, Hebrew, Indic, Thai, CJK) → searchable PDF or .txt |
| JPG to PDF | JPG/PNG/WebP/GIF/BMP → PDF with A4/Letter/fit, orientation, margins; honors EXIF rotation |
| Word / Excel / PowerPoint to PDF | Office documents → PDF on the server (see above) |
| HTML to PDF | Any public web page → PDF, with page size, orientation, margins and background options |
| PDF to JPG | Every page to JPG or PNG at 96/150/300 DPI |
| PDF to Word | “Keep the layout” (editable positioned text over the page's graphics) or “Flowing text” |
| PDF to PDF/A | PDF/A-2b with an sRGB output intent, XMP metadata and a preflight report |
| Rotate PDF | Rotate whole files, one or many at once |
| Page numbers | Six positions, formats like “Page 1 of 12”, page range, font, size, color |
| Add watermark | Text or image (logo), centered or tiled, with angle, size and opacity |
| Crop PDF | Drag the crop box or type margins in mm; all pages or the current one |
| Edit PDF | Add text, images, shapes, highlights, whiteout and freehand drawing; move, resize, delete |
| Sign PDF | Draw, type or upload a signature, then click to place, drag, resize, copy to every page |
| Protect PDF | AES-256 password, optional no-print / no-copy / no-edit restrictions |
| Unlock PDF | Removes passwords (with the password) and permission restrictions |
| Redact PDF | Draw boxes or search text; marked pages are flattened and the file rebuilt, so the content is gone |

Compress PDF also has a **Target size** mode: pick 100 KB to 2 MB (or type a size) and it searches
quality settings for the sharpest result that fits.

Multi-file results are zipped. After a single-PDF result, “Continue with this file” passes the
output straight into another tool.

All placement math respects each page's `/Rotate` and crop box, so numbers, watermarks,
signatures and crops land where the reader sees them, even on rotated pages.

## Getting around faster

- **Smart drop**: drop, choose or paste any file on the home page. PDFwise inspects it on the device
  (pages, text layer, encryption, size) and suggests the tools that fit. A scan gets OCR, a heavy file
  gets Compress, a locked one gets Unlock and several PDFs get Merge. One click opens the tool with
  the files already loaded.
- **Command palette**: <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> or <kbd>/</kbd> anywhere searches tools by
  name or intent (“reduce size”, “e-sign”, “compress 200kb”). Recently used tools come first.
- **Paste**: <kbd>Ctrl</kbd>+<kbd>V</kbd> adds copied files or screenshots on any tool page. On the home page
  a pasted link opens HTML to PDF with it filled in.
- **3D home page**: every tool floats as a page in a [three.js](https://threejs.org/) scene that follows
  the pointer. Click a page to open that tool. The scene loads in its own chunk after the page is
  idle, pauses when off-screen, and stays still with “reduce motion” turned on.

## Project layout

```
src/
  tools.js            tool registry (name, color, copy, related tools) and the BRAND constant
  seo.js              page titles, descriptions, keywords, how-to steps, FAQs, compress-to-size pages
  components/         shell: header, home grid, tool session (upload → edit → done), thumbnails,
                      Hero3D (three.js scene), SmartDrop, CommandPalette
  tools/              one workspace component per tool
  lib/
    ops.js            pdf-lib operations (merge, split, rotate, numbers, watermark, crop, sign)
    edit.js           draws Edit PDF elements into the document
    redact.js         text search and permanent redaction
    pdfa.js, icc.js   PDF/A-2b conversion and the sRGB ICC profile it embeds
    flatten.js        page → image replacement and orphan-free rebuilds
    compress.js       image re-encoding for Compress PDF, and compress-to-target-size search
    analyze.js        inspects dropped files and ranks the tools that fit
    handoff.js        passes files between pages; remembers recently used tools
    convert.js        images → PDF and PDF → images
    qpdf.js           qpdf WebAssembly wrapper: protect, unlock, repair
    ocr.js            Tesseract OCR and the invisible (any-script) text layer
    word.js           PDF → .docx (layout and flowing modes)
    server.js         client for the conversion server
    pdfjs.js          PDF.js setup, rendering and the lazy thumbnail cache
    geometry.js       visual ↔ PDF user-space mapping for rotated pages
scripts/
  prerender.mjs       per-page static HTML, sitemap.xml and robots.txt after the Vite build
server/
  index.js            routes, engine selection, auth, rate limiting
  engines/            libreoffice.js, browser.js (puppeteer-core + installed Chrome/Edge)
  office/             built-in DOCX/DOC/ODT/RTF/TXT, spreadsheet, PPTX and ODP → HTML
  egress-proxy.js     the checking proxy all headless-browser traffic goes through
  url-guard.js        address checks shared by the proxy and request interception
```

To rename the product, change `BRAND` in `src/tools.js`, the `<title>` in `index.html`, and the
logo in `src/components/Logo.jsx` / `public/favicon.svg`.

Each tool's code loads on demand, so the OCR, qpdf and docx libraries only download on their own pages.

## Notes

- The qpdf WebAssembly build never flushes qpdf's console output, so results are judged by exit
  code. Its damaged-file recovery doesn't work in WebAssembly either, which is why Repair falls back
  to pdf-lib.
- Whiteout in Edit PDF only covers content; use Redact PDF to remove it.
- Redacted pages become images (their remaining text is no longer selectable until you run OCR), and
  the rebuilt file drops bookmarks and form-field definitions.
- PDF/A conversion runs the checks it can (fonts, color, scripts, actions, annotations, metadata) and
  flattens pages that can't comply. For certified compliance, verify the result with a validator such
  as veraPDF.
- HTML → PDF can't see pages behind a login.

## Not included

Left out rather than faked: PDF → Excel / PowerPoint, and binary PPT conversion without LibreOffice.

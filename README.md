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
| `CHROME_NO_SANDBOX` | off | `1` launches Chromium with `--no-sandbox`, which most containers need (the [Dockerfile](Dockerfile) sets it). Leave it off elsewhere: the sandbox is what contains a hostile web page |
| `MAX_UPLOAD_MB` | `100` | |
| `CONVERT_TIMEOUT_S` | `120` | |
| `CONVERT_CONCURRENCY` | `2` | parallel LibreOffice instances |
| `BROWSER_CONCURRENCY` | `3` | parallel browser pages |
| `ALLOW_PRIVATE_URLS` | off | let HTML → PDF fetch local-network pages |

| Endpoint | |
| --- | --- |
| `GET /healthz` | `ok` — liveness check for Docker and load balancers; answers even with `BASIC_AUTH` on |
| `GET /api/health` | `{ ok, engine, formats, notes, libreoffice, browser, maxUploadMb }` |
| `POST /api/convert/pdf` | Raw file body + `X-File-Name` header (URL-encoded) → `application/pdf`, or `{ error }` with 400/413/415/422/429/503/504 |
| `POST /api/convert/url` | JSON `{ url, format: "A4"\|"Letter", landscape, margin: "none"\|"small"\|"normal", background, screen }` → `application/pdf` |

## Deploy

### VPS with Docker (recommended for production)

[docker-compose.yml](docker-compose.yml) runs two containers:

- **pdfwise:** the built app and conversion server, from the [Dockerfile](Dockerfile). It uses Node 22
  with Chromium and fonts (Latin, CJK and more), plus optional LibreOffice. It runs as a non-root
  user, with a health check, a memory limit, enough shared memory for Chromium, an init process that
  cleans up leftover browser processes, and rotated logs. It isn't published on the host.
- **caddy:** the public entry point ([deploy/Caddyfile](deploy/Caddyfile)). It gets and renews
  HTTPS certificates automatically, redirects HTTP → HTTPS and `www` → your domain, compresses
  responses, and adds security headers (HSTS, nosniff, frame and referrer policies).

The server also sets cache headers itself: hashed `/assets` files are cached for a year, while pages,
`sw.js` and the manifest are always re-checked, so updates reach installed apps.

**First deploy** (Ubuntu 22.04/24.04, 2 vCPU / 4 GB RAM or more):

```bash
# 1. DNS: point your domain's A record (and www) at the server's IP.
# 2. On the server:
curl -fsSL https://get.docker.com | sh
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
git clone https://github.com/chhasnainsaeed/pdfwise.git && cd pdfwise
cp .env.example .env && nano .env      # set DOMAIN, optional analytics / Search Console
docker compose up -d --build
```

Then open `https://your-domain`. The first visit can take a few seconds while Caddy gets the certificate.

**Updating:** `git pull && docker compose up -d --build`. The build re-creates the pre-rendered
pages, sitemap and service worker. Visitors who installed the app see "a new version is ready".

**Useful commands:** `docker compose logs -f pdfwise`, `docker compose ps` (shows health),
`docker compose restart pdfwise`.

**Settings** (in `.env`, see [.env.example](.env.example)):

- `DOMAIN` is required. Build-time values (`SITE_URL`, analytics, verification tags) are passed to
  the build automatically.
- `INCLUDE_LIBREOFFICE=true` adds LibreOffice: best Office fidelity and binary `.ppt`, about 600 MB
  more. Raise `PDFWISE_MEMORY` to `3g` with it.
- `BASIC_AUTH`: **leave it empty for a public site.** It puts the whole site, not just the API, behind
  a login, which suits a private team server. Public servers are protected by the per-IP rate limit
  (`RATE_LIMIT_PER_MIN`, default 30 conversions a minute), the upload limit, and the HTML → PDF
  egress proxy that refuses private and local addresses.
- `TRUST_PROXY` must match how traffic arrives, or every visitor shares one rate-limit bucket:
  - **Caddy only:** `TRUST_PROXY=1` (the default).
  - **Cloudflare → Caddy** (orange-cloud proxy): `TRUST_PROXY=2`, and set `TRUSTED_PROXIES` to
    Cloudflare's IP ranges (listed in `.env.example`; check https://www.cloudflare.com/ips/). Use SSL
    mode "Full (strict)" in Cloudflare.

**Sizing:** about 300 MB idle. Each HTML or Office conversion briefly adds a few hundred MB for
Chromium. `BROWSER_CONCURRENCY` (3) and `CONVERT_CONCURRENCY` (2) cap parallel work. Every tool that
runs in the browser costs the server nothing but serving files.

### Docker without Compose, or on Render / Railway / Fly.io

```bash
docker build --build-arg SITE_URL=https://your-domain.com -t pdfwise .
docker run -d --name pdfwise --restart unless-stopped --init --shm-size=512m \
  -p 127.0.0.1:3001:3001 -e TRUST_PROXY=1 pdfwise
```

Put a TLS proxy such as Caddy or nginx in front. With nginx, raise `client_max_body_size` to match
`MAX_UPLOAD_MB`. Build arguments: `SITE_URL`, `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`,
`VITE_PLAUSIBLE_DOMAIN`, `VITE_UMAMI_WEBSITE_ID`, `INCLUDE_LIBREOFFICE`. The container needs at least
1 GB of RAM (2 GB with LibreOffice).

**Render, Railway and Fly.io** build the Dockerfile straight from the repo and provide HTTPS.
Set `TRUST_PROXY=1`, pick an instance with 1 GB+ RAM (free 512 MB tiers are too small), set
`SITE_URL` (and the other build arguments) as build variables, and use `/healthz` as the health
check path. It answers even with `BASIC_AUTH` on. These platforms inject `PORT` themselves.

### Frontend only (Vercel, Netlify, Cloudflare Pages)

Without a server, every tool except the Office and HTML ones works, because the rest run in the
visitor's browser. Word / Excel / PowerPoint to PDF and HTML to PDF will say the conversion server
isn't available. Connect the repo with build command `npm run build` and output directory `dist`, and
set `SITE_URL` (plus any analytics or verification variables) as build environment variables.

- Pages are pre-rendered as `dist/<page>.html`. Netlify and Cloudflare Pages serve them at `/<page>`
  automatically. [vercel.json](vercel.json) turns on `cleanUrls` for Vercel.
- Unknown paths get `dist/404.html` with a real 404 status on all three.
- Cache headers for `sw.js`, the manifest and `/assets` come from [public/_headers](public/_headers)
  (Netlify, Cloudflare Pages) and [vercel.json](vercel.json).

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

## Growth: landing pages, analytics, search engines

### Landing pages for specific searches

[src/landing.js](src/landing.js) lists pages like “JPG to PDF under 200 KB”, “Merge PDF under 1 MB”,
“Compress PDF for a job application” or “Scan documents to PDF”. Each opens an existing tool or
workflow already set up for the job (target size, quality level or a chain of steps) and has its own
title, description, explanation, steps and FAQ. The build pre-renders each one, adds it to the
sitemap, `llms.txt`, the home page's “Made for the job you're doing” section and the command
palette, and links related pages to each other.

To add a page, add an entry to `LANDING_PAGES`. Write copy that's unique to the page, and only
state a site's upload limit if you've checked it on the official site.

### Analytics (optional, privacy-friendly)

Set one of these when building. Both providers are cookie-free, so no consent banner is needed:

```bash
VITE_PLAUSIBLE_DOMAIN=your-domain.com npm run build        # Plausible (VITE_PLAUSIBLE_SRC to self-host)
VITE_UMAMI_WEBSITE_ID=<website-id> npm run build           # Umami (VITE_UMAMI_SRC to self-host)
```

Besides page views, [src/lib/analytics.js](src/lib/analytics.js) records: `Files added` (tool, page,
count, how: picker/drop/paste/smart-drop/continue), `Tool completed` (tool, page, outputs, time,
offline, compress mode/size, workflow steps), `Tool failed`, `Download`, `Smart drop` and
`Smart drop pick`, `Search used`, `App installed`, `Install prompt`, `Shared into app`,
`Opened with app` and `404`. Counts and times are bucketed. File names, contents, typed text and
passwords are never sent. In Plausible, add these as custom events (goals), and add `tool` and
`page` as custom properties to break them down.

### Search Console and Bing

```bash
SITE_URL=https://your-domain.com \
GOOGLE_SITE_VERIFICATION=<content value of Google's HTML tag> \
BING_SITE_VERIFICATION=<content value of Bing's msvalidate.01 tag> \
npm run build
```

Then submit `https://your-domain.com/sitemap.xml` in both. The build also writes
[`llms.txt`](https://llmstxt.org/), a plain summary of every tool and task page for AI assistants
and AI search.

## Installable app and offline use

PDFwise is a Progressive Web App. Chrome, Edge and Android show **Install app** in the header, and on
iPhone or iPad the button explains *Share → Add to Home Screen*. Once installed:

- **Works offline.** The service worker stores every page and built file (about 4.7 MB) after the
  first visit. Every tool that runs in the browser works with no connection. OCR language data and
  web fonts are cached the first time they're used. Office → PDF and HTML → PDF still need the server,
  and they say so when you're offline.
- **Share into PDFwise** (Android): share a PDF or image from WhatsApp, Gmail, Files and so on. It
  opens on the home page with the file already checked and the right tools suggested.
- **Open with PDFwise** (desktop Chrome/Edge): PDFwise is offered for PDF, JPG, PNG and WebP files.
- **Shortcuts**: long-press or right-click the app icon for Compress, Merge, Workflows and Sign.
- **Updates**: a new deploy shows a "new version is ready — Reload" message, and the old cache is
  removed after reloading.

`npm run build` generates `dist/sw.js` from [scripts/sw-template.js](scripts/sw-template.js) with
[scripts/pwa.mjs](scripts/pwa.mjs). The service worker only registers in production builds and
needs HTTPS (or `localhost`). If you host the files somewhere other than the Node server, serve
`sw.js` and `manifest.webmanifest` with `Cache-Control: no-cache` so updates are picked up.

## Workflows

**PDF Workflows** (`/pdf-workflows`) chains tools into one click and runs them on a whole batch,
in the browser. Steps: Images to PDF, Repair, Unlock, Merge, Keep or remove pages, Rotate, OCR,
Watermark, Page numbers, Compress (by level or to a target size), Password protect and Pages to JPG.
Merge and Images to PDF combine the batch into one file. Every other step runs on each file
separately, and several results are zipped. Protect and Pages to JPG must come last, and the
builder explains anything that can't run.

Six ready-made recipes cover common jobs: Email-ready PDF, Application pack, Photos to small PDF,
Searchable scans, Confidential share and Bulk compress. Workflows can be saved in the browser or
shared as a link (`/pdf-workflows?w=…`). Shared links are checked against the known steps and
options, and passwords are never saved or put in a link. The engine is
[src/lib/workflow.js](src/lib/workflow.js). Each step reuses the same library code as the matching
single tool.

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
  seo.js              page titles, descriptions, keywords, how-to steps, FAQs; landing-page aliases
  landing.js          landing pages for specific searches (size, combine, task) with tool presets
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
    workflow.js       workflow steps, recipes, validation, runner, save/share encoding
    pwa.js            service worker registration/updates, install prompt, shared and opened files
    analytics.js      optional Plausible/Umami events (no file names or contents)
    convert.js        images → PDF and PDF → images
    qpdf.js           qpdf WebAssembly wrapper: protect, unlock, repair
    ocr.js            Tesseract OCR and the invisible (any-script) text layer
    word.js           PDF → .docx (layout and flowing modes)
    server.js         client for the conversion server
    pdfjs.js          PDF.js setup, rendering and the lazy thumbnail cache
    geometry.js       visual ↔ PDF user-space mapping for rotated pages
scripts/
  prerender.mjs       per-page static HTML, sitemap.xml, robots.txt and llms.txt after the Vite build
  pwa.mjs             writes dist/sw.js: offline file list + version hash
  sw-template.js      the service worker: offline caching, share target, updates
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

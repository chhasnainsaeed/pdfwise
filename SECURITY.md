# Security

## Reporting a vulnerability

Please report security problems **privately**, not in a public issue. Use GitHub's
**Security → Report a vulnerability** on this repository: private vulnerability reporting must be
turned on under Settings → Code security. Include the steps to reproduce and the impact. You'll get
a reply within a few days, and a fix or mitigation as soon as possible. Researchers are credited in
the release notes unless they prefer not to be.

Only the latest version of `main` is supported.

## How PDFwise is protected

**Files stay on the device.** Every PDF tool runs in the visitor's browser (pdf-lib, PDF.js, qpdf
WebAssembly, Tesseract). Those files are never uploaded. Only Office → PDF and HTML → PDF use the
server.

**The browser app**

- A strict Content-Security-Policy is sent on every response (`server/security-headers.js`).
  Scripts, workers, fonts and styles come only from the site itself. There are no inline scripts,
  no `eval`, no wildcards and no plugins (`object-src 'none'`), and framing is limited to this site.
  The only other origins are the OCR language data and the optional cookie-free analytics.
- No third-party code touches documents. The OCR engine (worker and WebAssembly core) and all fonts
  are served from the site itself, not from CDNs or Google.
- Plus `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`,
  `Cross-Origin-Opener-Policy`, `Permissions-Policy`, and HSTS on HTTPS.
- Shared workflow links and saved workflows are validated against the known steps and options.
  Passwords are never saved or put in links.
- Analytics are off unless configured, are cookie-free, and never include file names, contents
  or typed text.

**The conversion server**

- **Uploads:** size-limited (`MAX_UPLOAD_MB`). Office archives are checked for zip bombs before any
  parser runs (`server/archive.js`: unpacked size, entry count, compression ratio). At most
  `MAX_PENDING_CONVERSIONS` run at once, so memory can't be exhausted by parallel uploads.
- **Rate limiting:** `RATE_LIMIT_PER_MIN` conversions per client IP. Set `TRUST_PROXY` to match the
  proxy setup, so limits apply to real visitor IPs.
- **Server-side request forgery:** HTML → PDF can't reach the server's own network. Every request
  the page makes is checked (`server/url-guard.js`) against the IANA special-purpose ranges in every
  notation, including IPv6 forms that embed an IPv4 address, such as `::ffff:a9fe:a9fe` for the cloud
  metadata address. All browser traffic goes through a local proxy (`server/egress-proxy.js`) that
  connects to the exact IP it checked, which defeats DNS rebinding. Only http(s) on ports 80, 443,
  8080 and 8443 is allowed.
- **Untrusted documents:** each conversion gets its own browser context, and the network is blocked
  for document rendering. JavaScript is disabled for every format except DOCX, whose renderer needs it.
- **Uploaded file names** never reach a command line or file path: LibreOffice gets a fixed name, and
  the extension is checked against a list first.
- **Errors** shown to users never include stack traces or internal details.

**Deployment (`docker-compose.yml`)**

- The app runs as a non-root user with all Linux capabilities dropped, `no-new-privileges`, a
  process limit and a memory limit. It is reachable only through Caddy.
- Caddy provides HTTPS with automatic certificates, HSTS, and HTTP → HTTPS redirects.

## Known, reviewed risks

- **Chromium runs without its own sandbox inside Docker** (`CHROME_NO_SANDBOX=1`), because
  containers usually can't provide the namespaces it needs. The container is the boundary instead:
  non-root, no capabilities, no privilege escalation, egress through the checking proxy, and no
  scripts in untrusted documents except DOCX.
- **LibreOffice (optional, off by default)** can fetch remote resources that documents link to.
  Keep `INCLUDE_LIBREOFFICE=false` on public servers unless outbound traffic from the container is
  restricted at the network level.
- **Dependency advisories accepted after review** (`npm audit`): the moderate advisories in the
  `exceljs` chain (`archiver`, `zip-stream`, `glob`, `minimatch`, `uuid`). `archiver` is only used
  when _writing_ spreadsheets, and PDFwise only reads them. The `uuid` issue needs a caller-supplied
  buffer, which `exceljs` never passes. The development-only ESLint `minimatch` advisory only ever
  sees this repository's own glob patterns. CI fails on any high or critical advisory in
  production dependencies.

## Checklist for changes

- Run `npm run check`; CI must be green before merging.
- A new third-party origin (script, font, API) needs a CSP update in `server/security-headers.js`,
  and a reason.
- New server input needs validation and a size limit. New outbound fetches go through `url-guard`.
- Keep `tests/security.test.mjs` passing, and extend it when fixing a security bug.

# PDFwise in one container: the built app and the conversion server (Office → PDF, HTML → PDF).
#
#   docker build -t pdfwise .
#   docker build --build-arg INCLUDE_LIBREOFFICE=true -t pdfwise .   # adds LibreOffice (~600 MB more)
#   docker run -p 3001:3001 pdfwise
#
# Public site: pass your domain (and optional analytics / Search Console) at build time, because
# the build writes them into the pre-rendered pages, sitemap and app:
#   docker build --build-arg SITE_URL=https://your-domain.com \
#                --build-arg VITE_PLAUSIBLE_DOMAIN=your-domain.com \
#                --build-arg GOOGLE_SITE_VERIFICATION=... -t pdfwise .
# For production on a VPS, docker-compose.yml runs this with Caddy (automatic HTTPS) in front.

# puppeteer-core needs Node >= 22.12; the 22 tag is always a recent 22.x. Pulled from the Docker
# official images mirror on Amazon ECR Public, which has no Docker Hub pull limits.
FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS app

ARG INCLUDE_LIBREOFFICE=false

# Chromium prints web pages and the built-in converter's HTML; the fonts keep Latin, CJK and
# other text from turning into boxes. LibreOffice is optional: without it the built-in converter
# handles everything except binary .ppt.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates chromium fontconfig fonts-liberation fonts-noto-core fonts-noto-cjk \
 && if [ "$INCLUDE_LIBREOFFICE" = "true" ]; then \
      apt-get install -y --no-install-recommends libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress; \
    fi \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first so code-only changes reuse the cached install layer.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build-time settings for `npm run build` (all optional). Declared here, not at the top, so changing
# them only re-runs the build below, not the apt and npm install layers. RUN sees ARGs as env vars.
ARG SITE_URL=""
ARG GOOGLE_SITE_VERIFICATION=""
ARG BING_SITE_VERIFICATION=""
ARG VITE_PLAUSIBLE_DOMAIN=""
ARG VITE_PLAUSIBLE_SRC=""
ARG VITE_UMAMI_WEBSITE_ID=""
ARG VITE_UMAMI_SRC=""

# Vite is a devDependency, so dev dependencies are pruned only after the build.
RUN npm run build \
 && npm prune --omit=dev \
 && npm cache clean --force

ENV NODE_ENV=production \
    CHROME_PATH=/usr/bin/chromium \
    CHROME_NO_SANDBOX=1 \
    HOST=0.0.0.0 \
    PORT=3001

EXPOSE 3001

# /healthz answers before BASIC_AUTH, so this works with or without a password.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

# The server only writes to the temp dir (browser and LibreOffice profiles), so the code stays root-owned.
USER node

CMD ["node", "server/index.js"]

# AWS Lambda image (`docker build --target lambda --provenance=false`): the same server, run by the
# Lambda Web Adapter, which turns Lambda invocations into HTTP requests to port 3001. CloudFront
# serves the site from S3, so the built pages aren't needed here. Lambda's file system is read-only
# except /tmp, and it has no /dev/shm or user namespaces, hence the Chromium flags.
FROM app AS lambda
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter
USER root
RUN rm -rf /app/dist
USER node
ENV HOST=127.0.0.1 \
    HOME=/tmp \
    XDG_CACHE_HOME=/tmp/.cache \
    XDG_CONFIG_HOME=/tmp/.config \
    CHROME_ARGS="--disable-dev-shm-usage --no-zygote" \
    BROWSER_CONCURRENCY=1 \
    MAX_PENDING_CONVERSIONS=1 \
    AWS_LWA_PORT=3001 \
    AWS_LWA_READINESS_CHECK_PATH=/healthz

# The default build (Docker, docker-compose, VPS) stays the full app.
FROM app

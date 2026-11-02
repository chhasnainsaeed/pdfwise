# PDFwise in one container: the built app and the conversion server (Office → PDF, HTML → PDF).
#
#   docker build -t pdfwise .
#   docker build --build-arg INCLUDE_LIBREOFFICE=true -t pdfwise .   # adds LibreOffice (~600 MB more)
#   docker run -p 3001:3001 -e BASIC_AUTH=user:password pdfwise

# puppeteer-core needs Node >= 22.12; the 22 tag is always a recent 22.x.
FROM node:22-bookworm-slim

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

# The server only writes to the temp dir (browser and LibreOffice profiles), so the code stays root-owned.
USER node

CMD ["node", "server/index.js"]

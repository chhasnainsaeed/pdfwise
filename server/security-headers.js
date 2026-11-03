// The security headers every response carries, defined once and used by the Node server, the build
// (dist/_headers for Netlify and Cloudflare Pages) and checked against vercel.json by the tests.
//
// The Content-Security-Policy is a whitelist: scripts, workers, fonts and styles come only from this
// site; the network may reach this site, the OCR language data and the optional analytics provider.
// No other origin can run code in the page or receive data from it.

// Cookie-free analytics providers the app supports (src/lib/analytics.js).
export const ANALYTICS_ORIGINS = ['https://plausible.io', 'https://cloud.umami.is']
// OCR language data (data only: the OCR engine itself is served from this site).
const OCR_DATA = 'https://tessdata.projectnaptha.com'

/**
 * `extraOrigins`: self-hosted analytics, e.g. from VITE_PLAUSIBLE_SRC.
 * `uploadOrigins`: where serverless hosting stores files during a conversion (an S3 bucket).
 */
export function contentSecurityPolicy(extraOrigins = [], uploadOrigins = []) {
  const analytics = [...ANALYTICS_ORIGINS, ...extraOrigins].join(' ')
  return [
    "default-src 'self'",
    // 'wasm-unsafe-eval' lets WebAssembly (qpdf, OCR) compile; it does not allow eval() of JavaScript.
    `script-src 'self' 'wasm-unsafe-eval' ${analytics}`,
    "worker-src 'self' blob:",
    // Inline styles: the pre-rendered pages' small <style> block and React style props.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    `connect-src 'self' blob: data: ${[OCR_DATA, analytics, ...uploadOrigins].join(' ')}`,
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "manifest-src 'self'",
  ].join('; ')
}

/** Header name → value. HSTS is added separately, only on HTTPS. */
export function securityHeaders(extraOrigins = [], uploadOrigins = []) {
  return {
    'Content-Security-Policy': contentSecurityPolicy(extraOrigins, uploadOrigins),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  }
}

export const HSTS = 'max-age=31536000; includeSubDomains'

/** Origins of self-hosted analytics scripts configured for the build, if any. */
export function analyticsOriginsFromEnv(env = process.env) {
  return [env.VITE_PLAUSIBLE_SRC, env.VITE_UMAMI_SRC]
    .filter(Boolean)
    .map((u) => {
      try {
        return new URL(u).origin
      } catch {
        return null
      }
    })
    .filter((o) => o && !ANALYTICS_ORIGINS.includes(o))
}

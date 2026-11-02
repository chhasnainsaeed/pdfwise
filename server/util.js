export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/** Runs at most `n` tasks at a time; extra calls wait in line. */
export function limiter(n) {
  let active = 0
  const queue = []
  return async (fn) => {
    if (active >= n) await new Promise((resolve) => queue.push(resolve))
    active++
    try {
      return await fn()
    } finally {
      active--
      queue.shift()?.()
    }
  }
}

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// Files handed to the next tool page: from a result's "Continue with…", the home page's
// smart drop, a paste, or the command palette. Read once by the tool page it was meant for.
let pending = null

export function handOff(toolId, items, extra = {}) {
  pending = { tool: toolId, items, ...extra }
}

export function peekHandoff(toolId) {
  return pending?.tool === toolId ? pending : null
}

export function clearHandoff() {
  pending = null
}

// --- Recently used tools, remembered per browser ---

const RECENT_KEY = 'pdfwise:recent'

export function recentTools() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function rememberTool(id) {
  try {
    const next = [id, ...recentTools().filter((t) => t !== id)].slice(0, 6)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Storage blocked (private mode, disabled site data): recents just aren't kept.
  }
}

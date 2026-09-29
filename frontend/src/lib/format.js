// Tiny display helpers shared by several components.

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// "2 days ago", "just now". Intl.RelativeTimeFormat does the wording and plurals for us;
// we only pick the biggest unit that fits.
const UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function timeAgo(iso, now = Date.now()) {
  if (!iso) return ''
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000) // negative = in the past
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

// "1 source" / "3 sources"
export function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

// Muted spine colours for notebook covers; chosen to sit calmly on the slate background.
export const SPINE_COLORS = ['#C9785D', '#6FA3A0', '#B89B5E', '#7E9C6B', '#B5738A', '#5F86A8', '#A58BC4']

// Same id -> same colour every time (a tiny string hash, not random), so a notebook
// keeps its colour between visits without storing anything.
export function spineColor(id) {
  let hash = 0
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return SPINE_COLORS[hash % SPINE_COLORS.length]
}

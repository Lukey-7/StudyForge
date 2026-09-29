// localStorage can throw (private mode, blocked storage, full quota).
// These wrappers make it "best effort": the app works without it, it just forgets.

export function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore: nothing important is lost
  }
}

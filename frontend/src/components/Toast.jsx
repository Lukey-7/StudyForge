import { createContext, useCallback, useContext, useRef, useState } from 'react'

// Small toast system: any component calls `const toast = useToast()` then
// toast('Copied') or toast('Could not copy', 'error'). Messages disappear after a few seconds.
const ToastContext = createContext(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(0)

  // useCallback so the function identity is stable (components can put it in effect deps).
  const show = useCallback((message, kind = 'info') => {
    const id = ++nextId.current
    setToasts((list) => [...list.slice(-2), { id, message, kind }]) // keep at most 3 on screen
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3000)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* aria-live: screen readers announce new toasts without moving focus */}
      <div className="toast-region" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

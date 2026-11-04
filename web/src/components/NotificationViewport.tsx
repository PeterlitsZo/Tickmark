import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const NotificationTarget = createContext<HTMLElement | null>(null)
let updateAvailable = false
const listeners = new Set<() => void>()
export function reportUpdateAvailable() {
  updateAvailable = true
  listeners.forEach(listener => listener())
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

export function NotificationHost({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const needsReload = useSyncExternalStore(subscribe, () => updateAvailable)
  return <NotificationTarget.Provider value={target}>
    {children}
    {createPortal(<section id="notifications" ref={setTarget} className="notification-viewport" aria-label="Notifications">
      {needsReload && <div className="notification-card notification-error" role="alert"><strong>Update available</strong><p>Keep a copy of any unsaved work, then reload this page.</p><button className="text-button" onClick={() => window.location.reload()}>Reload</button></div>}
    </section>, document.body)}
  </NotificationTarget.Provider>
}

export function NotificationViewport({ children, notice, onDismiss }: {
  children: ReactNode; notice: string; onDismiss: () => void
}) {
  const target = useContext(NotificationTarget)
  return target ? createPortal(<>
    {children}
    {notice && <TransientNotice key={notice} message={notice} onDismiss={onDismiss} />}
  </>, target) : null
}

function TransientNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const remaining = useRef(5000)
  useEffect(() => {
    if (hovered || focused) return
    const started = Date.now()
    const timer = setTimeout(onDismiss, remaining.current)
    return () => { clearTimeout(timer); remaining.current -= Date.now() - started }
  }, [hovered, focused, onDismiss])
  return <div className="notification-card transient-notice" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}>
    <p role="status">{message}</p>
    <button className="icon-button" aria-label="Dismiss notification" onClick={onDismiss}><X size={16} /></button>
  </div>
}

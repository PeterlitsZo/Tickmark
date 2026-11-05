import { useEffect, useRef, useState, type RefObject } from 'react'
import type { TodoDraftStore } from './todoDrafts'

// Focus owns editing. Pointer gestures only delay its visual presentation so
// neither the old nor the new row changes geometry underneath a selection.
export function useTodoInteraction(root: RefObject<HTMLElement | null>, store: TodoDraftStore) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const focusId = useRef<string | null>(null)
  const gesture = useRef<number | null>(null)
  const frame = useRef<number | null>(null)

  function rowId(target: EventTarget | null) {
    if (!(target instanceof Element) || !root.current?.contains(target)) return null
    return target.closest<HTMLElement>('[data-todo-editor]')?.dataset.todoEditor ?? null
  }

  function focusChanged(target: EventTarget | null) {
    const next = rowId(target)
    const previous = focusId.current
    focusId.current = next
    if (previous && previous !== next) void store.flush(previous)
    if (gesture.current === null && frame.current === null) setActiveId(next)
  }

  useEffect(() => {
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return
      if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
      gesture.current = event.pointerId
    }
    const release = (event: PointerEvent) => {
      if (gesture.current !== event.pointerId) return
      gesture.current = null
      // Commit after mouseup/click defaults have finished, not mid-selection.
      frame.current = requestAnimationFrame(() => {
        frame.current = null
        setActiveId(focusId.current)
      })
    }
    const blur = () => {
      gesture.current = null
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
      if (focusId.current) void store.flush(focusId.current)
      setActiveId(null)
    }
    const focus = () => setActiveId(focusId.current)
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', release, true)
    window.addEventListener('pointercancel', release, true)
    window.addEventListener('blur', blur)
    window.addEventListener('focus', focus)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', release, true)
      window.removeEventListener('pointercancel', release, true)
      window.removeEventListener('blur', blur)
      window.removeEventListener('focus', focus)
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    }
  }, [store])

  return {
    activeId,
    focusTodo: (id: string, field: 'title' | 'description') => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      setActiveId(id)
      frame.current = requestAnimationFrame(() => {
        frame.current = null
        root.current?.querySelector<HTMLTextAreaElement>(`[data-todo-editor="${id}"] [data-field="${field}"]`)?.focus({ preventScroll: true })
      })
    },
    onFocusCapture: (event: React.FocusEvent<HTMLElement>) => focusChanged(event.target),
    onBlurCapture: (event: React.FocusEvent<HTMLElement>) => focusChanged(event.relatedTarget),
  }
}

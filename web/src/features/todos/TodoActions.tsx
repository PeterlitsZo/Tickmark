import { useEffect, useId, useRef } from 'react'
import { Ellipsis, Pencil, Trash2 } from 'lucide-react'
import styles from './TodoPanel.module.css'

export function TodoActions({ title, disabled, onEdit, onDelete }: {
  title: string; disabled: boolean; onEdit: () => void; onDelete: () => void
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const popover = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = () => popover.current?.hidePopover()
    // Keep the top-layer actions attached to their row while scrolling or resizing.
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [])

  function choose(action: () => void) {
    popover.current?.hidePopover()
    trigger.current?.focus()
    action()
  }

  return <div className={styles.actions}>
    <button ref={trigger} className="icon-button" aria-label={`Actions for ${title}`} disabled={disabled} popoverTarget={id} onClick={() => {
      const anchor = trigger.current?.getBoundingClientRect()
      const menu = popover.current
      if (!anchor || !menu) return
      trigger.current?.focus({ preventScroll: true })
      menu.style.left = `${Math.max(8, Math.min(anchor.right - 140, window.innerWidth - 148))}px`
      menu.style.top = `${Math.max(8, Math.min(anchor.bottom + 4, window.innerHeight - 112))}px`
    }}><Ellipsis size={17} /></button>
    <div ref={popover} id={id} popover="auto" className={styles.actionMenu} role="group" aria-label={`Actions for ${title}`} onToggle={event => {
      if (event.newState !== 'open') return
      const menu = popover.current
      const anchor = trigger.current?.getBoundingClientRect()
      if (!menu || !anchor) return
      menu.style.top = `${Math.max(8, Math.min(anchor.bottom + 4, window.innerHeight - menu.offsetHeight - 8))}px`
      menu.querySelector('button')?.focus({ preventScroll: true })
    }}>
      <button disabled={disabled} onClick={() => choose(onEdit)}><Pencil size={15} />Edit title</button>
      <button disabled={disabled} onClick={() => choose(onDelete)}><Trash2 size={15} />Delete todo</button>
    </div>
  </div>
}

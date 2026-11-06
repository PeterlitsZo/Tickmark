import { useEffect, useRef, type ReactNode, type RefObject } from 'react'

// Keep one editor mounted when the viewport changes; native modal behavior owns
// background isolation and Tab containment, including nested category dialogs.
export function EntrySheet({ children, closeGuard, onClose, existing }: {
  existing: boolean; children: ReactNode; closeGuard: RefObject<() => boolean>; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const composing = useRef(false)
  const focusSelector = useRef(existing ? '.editor' : '#entry-title')
  useEffect(() => {
    const element = dialog.current!
    const media = window.matchMedia('(max-width: 759px)')
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const update = () => {
      const focused = element.contains(document.activeElement) ? document.activeElement as HTMLElement : null
      if (element.open) element.close()
      if (media.matches) element.showModal()
      else element.show()
      focused?.focus({ preventScroll: true })
    }
    const viewport = window.visualViewport
    const resize = () => {
      element.style.setProperty('--entry-viewport-height', `${viewport?.height ?? window.innerHeight}px`)
      element.style.setProperty('--entry-viewport-top', `${viewport?.offsetTop ?? 0}px`)
      if (element.contains(document.activeElement)) document.activeElement?.scrollIntoView({ block: 'nearest' })
    }
    update(); resize()
    element.querySelector<HTMLElement>(focusSelector.current)?.focus({ preventScroll: true })
    media.addEventListener('change', update)
    viewport?.addEventListener('resize', resize)
    viewport?.addEventListener('scroll', resize)
    return () => {
      media.removeEventListener('change', update)
      viewport?.removeEventListener('resize', resize)
      viewport?.removeEventListener('scroll', resize)
      element.close()
      const target = previous?.isConnected && !previous.closest('dialog') ? previous : document.querySelector<HTMLElement>('.add-entry')
      target?.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={dialog} className="entry-sheet" aria-labelledby="editor-heading" onKeyDown={event => {
    const element = dialog.current
    if (event.key !== 'Tab' || !element?.matches(':modal')) return
    const controls = [...element.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(node => node.getClientRects().length > 0)
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && (document.activeElement === first || document.activeElement === element || document.activeElement === element.querySelector('.editor')) && last) {
      event.preventDefault(); last.focus()
    } else if (!event.shiftKey && document.activeElement === last && first) {
      event.preventDefault(); first.focus()
    }
  }} onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }} onCancel={event => {
    event.preventDefault()
    if (!composing.current && closeGuard.current()) onClose()
  }}>{children}</dialog>
}

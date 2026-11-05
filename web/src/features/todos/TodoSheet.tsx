import { useLayoutEffect, useRef } from 'react'
import { ChevronLeft } from 'lucide-react'
import { TodoEditor, type TodoEditorProps, type TodoField } from './TodoEditor'
import { draftStatus } from './TodoFeedback'
import styles from './TodoPanel.module.css'

export function TodoSheet({ initialField, ...props }: Omit<TodoEditorProps, 'active' | 'mobile'> & { initialField: TodoField; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const field = useRef(initialField)
  useLayoutEffect(() => {
    const node = dialog.current
    if (!node) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    node.showModal()
    node.querySelector<HTMLTextAreaElement>(`[data-field="${field.current}"]`)?.focus({ preventScroll: true })
    const viewport = window.visualViewport
    const resize = () => {
      node.style.height = `${viewport?.height ?? window.innerHeight}px`
      node.style.top = `${viewport?.offsetTop ?? 0}px`
    }
    resize()
    viewport?.addEventListener('resize', resize)
    viewport?.addEventListener('scroll', resize)
    return () => {
      viewport?.removeEventListener('resize', resize)
      viewport?.removeEventListener('scroll', resize)
      node.close()
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])
  const status = draftStatus(props.draft, props.store.online)
  return <dialog ref={dialog} className={styles.sheet} aria-label="Edit todo" onCancel={event => { event.preventDefault(); props.onClose() }}>
    <header className={styles.sheetHeader}><button className="text-button" onClick={props.onClose}><ChevronLeft size={18} />Todos</button>{status && <span role="status" className={styles.sheetStatus}>{status}</span>}</header>
    <div className={styles.sheetContent}><TodoEditor {...props} active mobile /></div>
  </dialog>
}

import { useLayoutEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { TodoEditor, type TodoEditorProps, type TodoField } from './TodoEditor'
import { draftStatus } from './TodoFeedback'
import styles from './TodoPanel.module.css'

export function TodoSheet({ initialField, onClose, ...props }: TodoEditorProps & { initialField: TodoField; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const field = useRef(initialField)
  useLayoutEffect(() => {
    const node = dialog.current
    if (!node) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    node.showModal()
    node.querySelector<HTMLTextAreaElement>(`[data-field="${field.current}"]`)?.focus({ preventScroll: true })
    return () => {
      node.close()
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])
  const status = draftStatus(props.draft, props.store.online)
  return <dialog ref={dialog} className={styles.sheet} aria-label="Edit todo" onCancel={event => { event.preventDefault(); onClose() }}>
    <header className={styles.sheetHeader}><h3>Edit todo</h3><button className="icon-button" aria-label="Close todo editor" onClick={onClose}><X size={18} /></button></header>
    <div className={styles.sheetContent}><TodoEditor {...props} /></div>
    <footer className={styles.sheetFooter}><span role="status" className={styles.sheetStatus}>{status || 'Changes are saved automatically.'}</span><button className="primary" onClick={onClose}>Done</button></footer>
  </dialog>
}

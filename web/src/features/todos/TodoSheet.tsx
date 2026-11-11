import { useLayoutEffect, useRef, useState } from 'react'
import { Ellipsis, X } from 'lucide-react'
import { TodoEditor, type TodoEditorProps, type TodoField } from './TodoEditor'
import { draftStatus } from './TodoFeedback'
import styles from './TodoPanel.module.css'

export function TodoSheet({ initialField, onClose, ...props }: TodoEditorProps & { initialField: TodoField; onClose: () => void }) {
  const [menu, setMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const moreButton = useRef<HTMLButtonElement>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)
  const keepButton = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    if (confirmDelete) keepButton.current?.focus()
    else if (menu) deleteButton.current?.focus()
  }, [menu, confirmDelete])
  const dialog = useRef<HTMLDialogElement>(null)
  const field = useRef(initialField)
  useLayoutEffect(() => {
    const node = dialog.current
    if (!node) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    node.showModal()
    node.querySelector<HTMLElement>(`[data-field="${field.current}"]`)?.focus({ preventScroll: true })
    return () => {
      node.close()
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])
  const status = draftStatus(props.draft, props.store.online)
  return <dialog ref={dialog} className={styles.sheet} aria-label="Edit todo" onCancel={event => { event.preventDefault(); if (confirmDelete) { setConfirmDelete(false); moreButton.current?.focus() } else if (menu) { setMenu(false); moreButton.current?.focus() } else onClose() }}>
    <header className={styles.sheetHeader}><span>Todo</span><div className={styles.modalActions}><button ref={moreButton} className="icon-button" aria-label="More actions" aria-expanded={menu} onClick={() => setMenu(!menu)}><Ellipsis size={18} /></button><button className="icon-button" aria-label="Close todo editor" onClick={onClose}><X size={18} /></button>
      {menu && <div className={styles.modalMenu}><button ref={deleteButton} disabled={!props.store.online || props.draft.deleting || props.draft.checking} onClick={() => { setMenu(false); setConfirmDelete(true) }}>Delete todo…</button></div>}
    </div></header>
    <div className={styles.sheetContent}><TodoEditor {...props} /></div>
    {confirmDelete && <div className={styles.deleteConfirm}><p>Delete this todo and its time records?</p><div className="row"><button ref={keepButton} onClick={() => { setConfirmDelete(false); moreButton.current?.focus() }}>Keep todo</button><button className={styles.deleteTodo} disabled={!props.store.online || props.draft.deleting || props.draft.checking} onClick={props.onDelete}>Delete todo</button></div></div>}
    <footer className={styles.sheetFooter}><span role="status" className={styles.sheetStatus}>{status || 'Saved automatically'}</span><button className="primary" onClick={onClose}>Done</button></footer>
  </dialog>
}

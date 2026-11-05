import { useId } from 'react'
import { Check } from 'lucide-react'
import { TodoActions } from './TodoActions'
import { TodoTextField } from './TodoTextField'
import { DraftFeedback, draftStatus } from './TodoFeedback'
import { validNotes, validTitle, type TodoDraft, type TodoDraftStore } from './todoDrafts'
import styles from './TodoPanel.module.css'

export type TodoField = 'title' | 'description'
export type TodoEditorProps = {
  draft: TodoDraft; store: TodoDraftStore; active: boolean
  onStatus: () => void; onDelete: () => void
  onClose?: () => void; mobile?: boolean
}

export function TodoEditor({ draft, store, active, onStatus, onDelete, onClose, mobile = false }: TodoEditorProps) {
  const id = useId()
  const todoId = draft.base.id
  const titleError = !validTitle(draft.title)
  const notesError = !validNotes(draft.description)
  const locked = draft.deleting || draft.checking || draft.missing || draft.recovery || draft.uncertain || draft.deleteUncertain || !!draft.error || !store.online || draft.pendingStatus !== undefined
  const field = (name: TodoField) => ({
    value: draft[name],
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => store.change(todoId, name, event.target.value),
    onCompositionStart: () => store.composition(todoId, name, true),
    onCompositionEnd: () => store.composition(todoId, name, false),
    disabled: draft.deleting,
  })
  return <div className={styles.editor} data-todo-editor={todoId} onKeyDown={event => {
    if (event.key !== 'Escape' || event.nativeEvent.isComposing) return
    event.preventDefault(); event.stopPropagation()
    if (mobile) onClose?.()
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }}>
    <div className={styles.itemRow}>
      <button className={styles.check} role="checkbox" aria-checked={draft.base.status === 'COMPLETED'} aria-label={`${draft.base.status === 'COMPLETED' ? 'Reopen' : 'Complete'} ${draft.title}`} disabled={locked} onClick={onStatus}><span>{draft.base.status === 'COMPLETED' && <Check size={10} strokeWidth={2.5} />}</span></button>
      <TodoTextField {...field('title')} kind="title" completed={!active && draft.base.status === 'COMPLETED'} data-field="title" data-todo-trigger={todoId} aria-label="Todo title" aria-invalid={titleError} aria-describedby={titleError ? `${id}-title-error` : undefined} />
      <TodoActions title={draft.title} disabled={draft.deleting || draft.checking} onDelete={onDelete} />
    </div>
    <div className={styles.noteBody}>
      {titleError && <p id={`${id}-title-error`} className="field-error">Use 1–500 characters for the title.</p>}
      <TodoTextField {...field('description')} kind="notes" expanded={active || mobile} data-field="description" aria-label="Todo notes" placeholder="Add notes..." aria-invalid={notesError} aria-describedby={notesError ? `${id}-notes-error` : undefined} />
      {notesError && <p id={`${id}-notes-error`} className="field-error">Use 10,000 characters or fewer for notes.</p>}
      {!mobile && draftStatus(draft, store.online) && <p className={styles.saveStatus} role="status">{draftStatus(draft, store.online)}</p>}
      <DraftFeedback draft={draft} store={store} />
    </div>
  </div>
}

import { useId } from 'react'
import { DraftFeedback } from './TodoFeedback'
import { validNotes, validTitle, type TodoDraft, type TodoDraftStore } from './todoDrafts'
import styles from './TodoPanel.module.css'

export type TodoField = 'title' | 'description'
export type TodoEditorProps = {
  draft: TodoDraft; store: TodoDraftStore
  onStatus: () => void; onDelete: () => void
}

export function TodoEditor({ draft, store, onStatus, onDelete }: TodoEditorProps) {
  const id = useId()
  const todoId = draft.base.id
  const titleError = !validTitle(draft.title)
  const notesError = !validNotes(draft.description)
  const locked = draft.deleting || draft.checking || draft.missing || draft.recovery || draft.uncertain || draft.deleteUncertain || !!draft.error || !store.online || draft.pendingStatus !== undefined
  const field = (name: TodoField) => ({
    id: `${id}-${name}`,
    value: draft[name],
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => store.change(todoId, name, event.target.value),
    onCompositionStart: () => store.composition(todoId, name, true),
    onCompositionEnd: () => store.composition(todoId, name, false),
    disabled: draft.deleting,
  })
  return <div className={styles.modalEditor}>
    <label htmlFor={`${id}-title`}>Title</label>
    <textarea {...field('title')} rows={2} data-field="title" aria-invalid={titleError} aria-describedby={titleError ? `${id}-title-error` : undefined} />
    {titleError && <p id={`${id}-title-error`} className="field-error">Use 1–500 characters for the title.</p>}
    <label htmlFor={`${id}-description`}>Description</label>
    <textarea {...field('description')} rows={7} data-field="description" placeholder="Add a description…" aria-invalid={notesError} aria-describedby={notesError ? `${id}-notes-error` : undefined} />
    {notesError && <p id={`${id}-notes-error`} className="field-error">Use 10,000 characters or fewer for the description.</p>}
    <label className={styles.statusField}><input type="checkbox" checked={draft.base.status === 'COMPLETED'} disabled={locked} onChange={onStatus} />Completed</label>
    <DraftFeedback draft={draft} store={store} />
    <button className={styles.deleteTodo} disabled={!store.online || draft.deleting || draft.checking} onClick={onDelete}>Delete todo</button>
  </div>
}

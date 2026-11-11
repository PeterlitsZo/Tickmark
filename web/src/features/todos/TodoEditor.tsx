import { useId } from 'react'
import { dateInZone, formatMinutes, validMinutes } from '../../../../shared/todoEffort'
import { DraftFeedback } from './TodoFeedback'
import { validNotes, validTitle, type TodoDraft, type TodoDraftStore } from './todoDrafts'
import styles from './TodoPanel.module.css'

export type TodoField = 'title' | 'description' | 'spent'
export type TodoEditorProps = {
  draft: TodoDraft; store: TodoDraftStore
  onStatus: () => void; onDelete: () => void
}

export function TodoEditor({ draft, store, onStatus }: TodoEditorProps) {
  const id = useId()
  const todoId = draft.base.id
  const titleError = !validTitle(draft.title)
  const notesError = !validNotes(draft.description)
  const locked = draft.deleting || draft.checking || draft.missing || draft.recovery || draft.uncertain || draft.deleteUncertain || !!draft.error || !store.online || draft.pendingStatus !== undefined
  const field = (name: 'title' | 'description') => ({
    id: `${id}-${name}`, value: draft[name],
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => store.change(todoId, name, event.target.value),
    onCompositionStart: () => store.composition(todoId, name, true),
    onCompositionEnd: () => store.composition(todoId, name, false),
    onBlur: () => { void store.flush(todoId) }, disabled: draft.deleting,
  })
  const effortField = (name: 'spent' | 'expected') => ({
    id: `${id}-${name}`, value: draft[name], type: 'number', inputMode: 'numeric' as const,
    min: name === 'spent' ? 0 : 1, max: 1440, step: 1,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => store.change(todoId, name, event.target.value),
    onBlur: () => { void store.flush(todoId) }, disabled: draft.deleting,
    'aria-invalid': !validMinutes(draft[name], name === 'expected'),
    'aria-describedby': `${id}-${name}-help`,
  })
  const total = draft.base.total_spent_minutes! - draft.base.today_spent_minutes! + (validMinutes(draft.spent) ? Number(draft.spent) : draft.base.today_spent_minutes!)
  const past = draft.base.time_zone && draft.base.today !== dateInZone(draft.base.time_zone)
  return <div className={styles.modalEditor}>
    <label className="sr-only" htmlFor={`${id}-title`}>Title</label>
    <textarea {...field('title')} className={styles.modalTitle} rows={1} data-field="title" aria-invalid={titleError} aria-describedby={titleError ? `${id}-title-error` : undefined} />
    {titleError && <p id={`${id}-title-error`} className="field-error">Use 1–500 characters for the title.</p>}
    <label htmlFor={`${id}-description`}>Notes</label>
    <textarea {...field('description')} className={styles.modalNotes} rows={2} data-field="description" placeholder="Add a note…" aria-invalid={notesError} aria-describedby={notesError ? `${id}-notes-error` : undefined} />
    {notesError && <p id={`${id}-notes-error`} className="field-error">Use 10,000 characters or fewer for the notes.</p>}
    {draft.base.today ? <section className={styles.effort} aria-label="Time spent">
      <div className={styles.effortHeading}><strong>Time spent</strong><span>{draft.base.today} · {draft.base.time_zone}</span></div>
      {past && <p className={styles.dayNotice}>This draft belongs to {draft.base.today}. Save it before recording today.</p>}
      <div className={styles.effortNumbers}>
        <div><label htmlFor={`${id}-spent`}>{past ? 'Day’s total' : 'Today’s total'}</label><div className={styles.minutes}><input {...effortField('spent')} data-field="spent" required /><span>min</span></div></div>
        <div><span className={styles.totalLabel}>Total</span><output className={styles.total}>{formatMinutes(total)}</output><span className={styles.totalHint}>Including {past ? 'this day' : 'today'}</span></div>
      </div>
      <p id={`${id}-spent-help`} className={validMinutes(draft.spent) ? 'sr-only' : 'field-error'}>{validMinutes(draft.spent) ? 'Enter the total minutes for this day, not an additional amount.' : 'Use a whole number from 0 to 1440.'}</p>
      <div className={styles.expectation}><label htmlFor={`${id}-expected`}>Daily expectation</label><span className={styles.expectationValue}><input {...effortField('expected')} placeholder="—" /><span>min / day</span></span></div>
      <p id={`${id}-expected-help`} className={validMinutes(draft.expected, true) ? 'sr-only' : 'field-error'}>{validMinutes(draft.expected, true) ? 'Leave blank for no daily expectation.' : 'Use 1–1440 minutes, or leave blank.'}</p>
    </section> : <p className={styles.dayNotice}>Time tracking is unavailable on this server. You can still edit this todo.</p>}
    <label className={styles.statusField}><input type="checkbox" checked={(draft.pendingStatus ?? draft.base.status) === 'COMPLETED'} disabled={locked} onChange={onStatus} />{draft.base.status === 'COMPLETED' ? 'Todo completed' : 'Mark todo complete'}</label>
    <DraftFeedback draft={draft} store={store} />
  </div>
}

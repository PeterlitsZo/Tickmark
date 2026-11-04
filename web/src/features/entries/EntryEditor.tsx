import { useForm, useStore } from '@tanstack/react-form'
import { useBlocker } from '@tanstack/react-router'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { X, Trash2, Clock3 } from 'lucide-react'
import { ApiError, type Entry, type EntryInput } from '../../api/entries'
import { civilValue, occurrences, offsetLabel, duration, trimTitle, validateInput } from '../../lib/time'
import type { EntryMutations, Operation } from './useEntryMutations'

export type EditorSession = { key: string; original?: Entry; input: EntryInput; zone: string }
export function OperationStatus({ operation: op, mutations, online }: { operation: Operation; mutations: EntryMutations; online: boolean }) {
  return <div className="notification-card operation-status" role="status">
    <strong>{op.status === 'saving' ? 'Saving your entry' : op.status === 'checking' ? 'Checking the service' : 'Change not yet confirmed'}</strong>
    <p>{op.message}</p>
    {op.status === 'uncertain' && <div className="status-actions">
      <button className="secondary" type="button" disabled={!online} onClick={() => void mutations.check(op.key)}>Check status</button>
      {op.match && <button className="secondary" type="button" disabled={!online} onClick={() => void mutations.useMatch(op.key)}>Use existing entry</button>}
      <button className="text-button" type="button" disabled={!online} onClick={() => void mutations.retry(op.key)}>Retry {op.kind === 'delete' ? 'deletion' : 'save'}…</button>
    </div>}
  </div>
}
export function EntryEditor({ session, mutations, online, modal, notify, onClose, onPreviewChange, closeGuard }: {
  modal: boolean; notify: (message: string) => void; onPreviewChange: (input: EntryInput | null) => void; session: EditorSession; mutations: EntryMutations; online: boolean; onClose: () => void; closeGuard: RefObject<() => boolean>
}) {
  const { input, original, zone } = session
  const opKey = original?.id ?? 'create'
  const operation = mutations.pending[opKey]
  const initialCompleted = useRef(mutations.completed[opKey] ?? 0)
  const panel = useRef<HTMLElement>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  const initial = { title: input.title, start: civilValue(input.start_time, zone), end: civilValue(input.end_time, zone), startOccurrence: input.start_time, endOccurrence: input.end_time }
  const form = useForm({
    defaultValues: initial,
    onSubmit: async ({ value }) => {
      const starts = occurrences(value.start, zone)
      const ends = occurrences(value.end, zone)
      const target = {
        title: trimTitle(value.title),
        start_time: starts.includes(value.startOccurrence) ? value.startOccurrence : starts[0],
        end_time: ends.includes(value.endOccurrence) ? value.endOccurrence : ends[0],
      }
      const next = validateInput(target)
      if (!starts.length) next.start_time = 'This local time does not exist or is outside the supported range.'
      if (!ends.length) next.end_time = 'This local time does not exist or is outside the supported range.'
      setErrors(next)
      if (Object.keys(next).length) return
      try {
        const result = await mutations.submit(original ? 'replace' : 'create', target, original)
        if (result !== undefined) onClose()
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Could not save this entry.')
        if (error instanceof ApiError) setErrors(error.fields)
      }
    },
  })
  const values = useStore(form.store, state => state.values)
  const isSubmitting = useStore(form.store, state => state.isSubmitting)
  const dirty = useStore(form.store, state => state.isDirty)
  const locked = !!operation || isSubmitting
  // Submission temporarily disables the fieldset. Focus only after it is enabled.
  useEffect(() => {
    if (locked) return
    const first = Object.keys(errors)[0]?.replace('_time', '')
    if (first) document.getElementById(`entry-${first}`)?.focus()
  }, [errors, locked])
  const guard = useRef({ dirty, locked, operation, onClose })
  guard.current = { dirty, locked, operation, onClose }
  function canClose() {
    if (guard.current.locked) {
      if (guard.current.operation?.status !== 'uncertain') return false
      return window.confirm('This change is not confirmed. Its status will stay visible on the calendar. Close the editor?')
    }
    return !guard.current.dirty || window.confirm('Discard your unsaved changes?')
  }
  closeGuard.current = canClose
  useBlocker({
    shouldBlockFn: () => {
      if (!canClose()) return true
      guard.current.onClose()
      return false
    },
    enableBeforeUnload: () => guard.current.dirty || guard.current.locked,
  })
  const close = () => { if (canClose()) onClose() }
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const target = original ? panel.current : panel.current?.querySelector<HTMLInputElement>('#entry-title')
    target?.focus({ preventScroll: true })
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        if (canClose()) guard.current.onClose()
      }
      if (event.key === 'Tab' && window.matchMedia('(max-width: 759px)').matches) {
        const nodes = document.querySelectorAll<HTMLElement>('.editor button:not(:disabled), .editor input:not(:disabled), .editor select:not(:disabled), .notification-viewport button:not(:disabled)')
        if (!nodes?.length) return
        const first = nodes[0], last = nodes[nodes.length - 1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); (previous?.isConnected && !previous.closest('[inert]') ? previous : document.querySelector<HTMLElement>('.add-entry'))?.focus({ preventScroll: true }) }
  }, [original])
  useEffect(() => {
    if ((mutations.completed[opKey] ?? 0) !== initialCompleted.current) onClose()
  }, [mutations.completed, opKey, onClose])
  const starts = occurrences(values.start, zone), ends = occurrences(values.end, zone)
  const start = starts.includes(values.startOccurrence) ? values.startOccurrence : starts[0]
  const end = ends.includes(values.endOccurrence) ? values.endOccurrence : ends[0]
  useEffect(() => {
    if (original) return
    onPreviewChange(Number.isFinite(start) && Number.isFinite(end) && end >= start
      ? { title: values.title, start_time: start, end_time: end }
      : null)
  }, [original, start, end, values.title, onPreviewChange])
  async function remove() {
    try { await mutations.submit('delete', undefined, original) }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not delete this entry.') }
  }
  return <section className="editor" ref={panel} tabIndex={-1} role={modal ? 'dialog' : 'region'} aria-modal={modal || undefined} aria-owns={modal ? 'notifications' : undefined} aria-labelledby="editor-heading">
    <header className="editor-heading"><div><h2 id="editor-heading">{original ? 'Edit entry' : 'New entry'}</h2></div><button className="icon-button" aria-label="Close editor" disabled={locked && operation?.status !== 'uncertain'} onClick={close}><X size={16} /></button></header>
    <form className="entry-form" noValidate onSubmit={event => { event.preventDefault(); void form.handleSubmit() }}>
      <fieldset disabled={locked}>
        <form.Field name="title">{field => <div className="field"><label htmlFor="entry-title">Title</label><input id="entry-title" type="text" placeholder="Entry title" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} onKeyDown={event => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          // IME confirmation must not submit, including Safari's keyCode fallback.
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || event.repeat || locked || !online) return
          event.currentTarget.form?.requestSubmit()
        }} aria-invalid={!!errors.title} aria-describedby={errors.title ? 'title-error' : undefined} /><span className="field-meta">{Array.from(values.title).length} / 500</span>{errors.title && <p className="field-error" id="title-error">{errors.title}</p>}</div>}</form.Field>
        {(['start', 'end'] as const).map(name => {
          const candidates = name === 'start' ? starts : ends
          const selected = name === 'start' ? start : end
          const error = errors[`${name}_time`]
          return <div className="field" key={name}>
            <label htmlFor={`entry-${name}`}>{name === 'start' ? 'Start' : 'End'}</label>
            <form.Field name={name}>{field => <input id={`entry-${name}`} type="datetime-local" step="1" min="1970-01-01T00:00" max="9999-12-31T23:59:59" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} aria-invalid={!!error} aria-describedby={error ? `${name}-error` : undefined} />}</form.Field>
            {candidates.length > 1 && <label className="occurrence">This hour occurs twice<select aria-label={`${name} UTC offset`} value={selected} onChange={e => form.setFieldValue(`${name}Occurrence`, Number(e.target.value))}>{candidates.map(t => <option key={t} value={t}>{offsetLabel(t, zone)}</option>)}</select></label>}
            {error && <p className="field-error" id={`${name}-error`}>{error}</p>}
          </div>
        })}
      </fieldset>
      <p className="timezone"><Clock3 size={15} />{zone}{Number.isFinite(start) && <span>{offsetLabel(start, zone)}</span>}</p>
      <div className="duration"><span>Duration</span><strong>{Number.isFinite(end - start) && end >= start ? duration(end - start) : '—'}</strong></div>
      {confirmDelete && !operation && <div className="delete-confirm" role="alert"><strong>Permanently delete this entry?</strong><p>This cannot be undone.</p><div className="row"><button type="button" className="danger-button" disabled={!online} onClick={() => void remove()}>Delete permanently</button><button type="button" className="secondary" onClick={() => setConfirmDelete(false)}>Keep entry</button></div></div>}
      <footer className="editor-actions">
        {original && <button type="button" className="delete-button" aria-label="Delete entry" disabled={locked || !online} onClick={() => setConfirmDelete(true)}><Trash2 size={17} /><span>Delete</span></button>}
        <div className="row"><button type="button" className="secondary" disabled={locked} onClick={close}>Cancel</button><button type="submit" className="primary" disabled={locked || !online}>{operation?.status === 'uncertain' ? 'Awaiting confirmation' : locked ? 'Saving…' : original ? 'Save changes' : 'Save entry'}</button></div>
      </footer>
    </form>
  </section>
}

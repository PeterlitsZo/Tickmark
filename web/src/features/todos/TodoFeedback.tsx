import { isDirty, validTitle, validNotes, type TodoDraft, type TodoDraftStore } from './todoDrafts'
import styles from './TodoPanel.module.css'

export function draftStatus(draft: TodoDraft, online: boolean) {
  if (draft.deleting) return 'Deleting…'
  if (draft.checking) return 'Checking…'
  if (draft.missing) return 'Todo no longer exists'
  if (draft.recovery) return 'Review recovered changes'
  if (draft.error || draft.uncertain || draft.deleteUncertain) return 'Could not save'
  if (!online && isDirty(draft)) return 'Offline · Changes kept here'
  if (draft.flight) return ''
  if (!validTitle(draft.title) || !validNotes(draft.description)) return 'Check your changes'
  return ''
}

export function DraftFeedback({ draft, store }: { draft: TodoDraft; store: TodoDraftStore }) {
  const id = draft.base.id
  const [titleCount, notesCount] = [[...draft.title].length, [...draft.description].length]
  return <div className={styles.feedback}>
    {draft.error && <p role="alert">{draft.error}</p>}
    {draft.recovery && <div className={styles.recovery}>
      <p>Your local draft is shown above. Compare it with the server before continuing.</p>
      {draft.remote ? <details><summary>Server version</summary><strong>{draft.remote.title}</strong><p className={styles.remoteNotes}>{draft.remote.description || 'No notes'}</p><p>{draft.remote.status === 'COMPLETED' ? 'Completed' : 'Open'}</p></details> : <p>Connect and check the server to recover this draft.</p>}
      <div className="row"><button className="text-button" disabled={!store.online || draft.checking || draft.missing} onClick={() => { if (window.confirm('Use this local draft? It may replace newer changes on another device.')) void store.resolve(id, true) }}>Use my draft</button><button className="text-button" disabled={!store.online || draft.checking || draft.missing} onClick={() => { if (window.confirm('Discard this local draft and use the current server version?')) void store.resolve(id, false) }}>Use server version</button></div>
    </div>}
    {(draft.error || draft.uncertain || draft.recovery || draft.deleteUncertain) && !draft.missing && <button className="text-button" disabled={!store.online || draft.checking || draft.deleting} onClick={() => void store.check(id)}>{draft.uncertain || draft.recovery || draft.deleteUncertain ? 'Check server' : 'Retry'}</button>}
    {draft.missing && <><p>Your text is kept above. Select and copy it before dismissing.</p><button className="text-button" onClick={() => { if (window.confirm('Dismiss this draft? Copy any text you want to keep first.')) store.dismissMissing(id) }}>Dismiss draft</button></>}
    {titleCount >= 450 && <span className={styles.count}>{titleCount} / 500 title characters</span>}
    {notesCount >= 9000 && <span className={styles.count}>{notesCount} / 10,000 note characters</span>}
  </div>
}


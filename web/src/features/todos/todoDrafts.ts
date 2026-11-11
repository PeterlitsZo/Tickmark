import { validMinutes } from '../../../../shared/todoEffort'
import type { QueryClient } from '@tanstack/react-query'
import { ApiError, object } from '../../api/client'
import { parseTodo, todosApi, type Todo, type TodoPatch, type TodoStatus } from '../../api/todos'

export const todoKey = ['todos', 'ALL'] as const
export const validTitle = (value: string) => [...value].length > 0 && [...value].length <= 500
export const validNotes = (value: string) => [...value].length <= 10_000
const interval = 5000
const storagePrefix = 'tickmark.todo-draft.v1.'
type Field = 'title' | 'description' | 'expected' | 'spent'
const fields: Field[] = ['title', 'description', 'expected', 'spent']
const baseValue = (todo: Todo, field: Field) => field === 'expected' ? String(todo.expected_daily_minutes ?? '') : field === 'spent' ? String(todo.today_spent_minutes ?? '') : todo[field]
const sentValue = (patch: TodoPatch | undefined, field: Field) => field === 'expected' ? patch?.expected_daily_minutes === undefined ? undefined : String(patch.expected_daily_minutes ?? '') : field === 'spent' ? patch?.daily_effort === undefined ? undefined : String(patch.daily_effort.minutes) : patch?.[field]

export type TodoDraft = {
  base: Todo
  title: string
  description: string
  expected: string
  spent: string
  pendingStatus?: TodoStatus
  sent?: TodoPatch
  remote?: Todo
  error: string
  recovery: boolean
  uncertain: boolean
  missing: boolean
  deleting: boolean
  deleteUncertain: boolean
  checking: boolean
  composing: Set<Field>
  timer?: ReturnType<typeof setTimeout>
  due?: number
  lastStarted: number
  flight?: Promise<void>
}

const locallyChanged = (draft: TodoDraft, field: Field) => draft[field] !== baseValue(draft.base, field) || sentValue(draft.sent, field) !== undefined && draft[field] !== sentValue(draft.sent, field)

export const isDirty = (draft: TodoDraft) => fields.some(field => draft[field] !== baseValue(draft.base, field)) || draft.pendingStatus !== undefined
export const needsAttention = (draft: TodoDraft) => isDirty(draft) || !!draft.flight || draft.recovery || draft.uncertain || draft.deleteUncertain || draft.deleting || !!draft.error || draft.missing

// The store belongs to QueryClient, not the editor. Timers and in-flight writes
// survive panel collapse, responsive remounts, and calendar navigation.
export class TodoDraftStore {
  readonly drafts = new Map<string, TodoDraft>()
  storageWarning = ''
  online = navigator.onLine
  private listeners = new Set<() => void>()
  private revision = 0
  private hydrated = false
  private removed = new Set<string>()
  constructor(private client: QueryClient) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  snapshot = () => this.revision
  private emit() { this.revision++; this.listeners.forEach(listener => listener()) }
  private storageFailed() { this.storageWarning = 'Local recovery is unavailable. Keep this page open until your changes are saved.' }

  hydrate() {
    if (this.hydrated) return
    this.hydrated = true
    try {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith(storagePrefix)) continue
        try {
          const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
          if (!object(value) || typeof value.title !== 'string' || typeof value.description !== 'string') throw new Error('Invalid draft')
          const base = parseTodo(value.base)
          if (key !== storagePrefix + base.id) throw new Error('Invalid draft ID')
          const draft = this.ensure(base)
          draft.title = value.title; draft.description = value.description
          if (typeof value.expected === 'string') draft.expected = value.expected
          if (typeof value.spent === 'string') draft.spent = value.spent
          if (value.pendingStatus === 'OPEN' || value.pendingStatus === 'COMPLETED') draft.pendingStatus = value.pendingStatus
          draft.deleteUncertain = value.deleteUncertain === true
          // A reload can interrupt a request after it has already reached D1.
          draft.recovery = true
          draft.uncertain = value.uncertain === true
        } catch { this.storageWarning = 'A saved draft could not be read. Browser storage was kept; copy it before clearing site data.' }
      }
    } catch { this.storageFailed() }
    this.emit()
  }

  ensure(todo: Todo): TodoDraft {
    let draft = this.drafts.get(todo.id)
    if (!draft) {
      draft = { base: todo, title: todo.title, description: todo.description, expected: baseValue(todo, 'expected'), spent: baseValue(todo, 'spent'), error: '', recovery: false, uncertain: false, missing: false, deleting: false, deleteUncertain: false, checking: false, composing: new Set(), lastStarted: 0 }
      this.drafts.set(todo.id, draft)
    }
    return draft
  }

  private persist(draft: TodoDraft) {
    try {
      const key = storagePrefix + draft.base.id
      if (needsAttention(draft)) {
        localStorage.setItem(key, JSON.stringify({ base: draft.base, title: draft.title, description: draft.description, expected: draft.expected, spent: draft.spent, pendingStatus: draft.pendingStatus, uncertain: draft.uncertain || !!draft.flight, deleteUncertain: draft.deleteUncertain || draft.deleting }))
      } else localStorage.removeItem(key)
    } catch { this.storageFailed() }
  }

  isRemoved(id: string) { return this.removed.has(id) }

  ingest(items: Todo[], complete = true) {
    const present = new Map(items.map(todo => [todo.id, todo]))
    for (const [id, draft] of this.drafts) {
      if (draft.flight || draft.deleting || draft.checking) continue
      let remote = present.get(id)
      if (!remote) {
        if (complete && needsAttention(draft)) { draft.missing = true; draft.error = 'This todo no longer exists. Copy your draft before dismissing it.'; this.cancelTimer(draft) }
        continue
      }
      draft.remote = remote
      if (draft.base.today !== remote.today && draft.spent !== baseValue(draft.base, 'spent')) {
        remote = { ...remote, today: draft.base.today, today_spent_minutes: draft.base.today_spent_minutes }
      }
      if (draft.recovery || draft.uncertain || draft.error) continue
      const changedElsewhere = fields.some(field => draft[field] !== baseValue(draft.base, field) && baseValue(remote, field) !== baseValue(draft.base, field) && baseValue(remote, field) !== draft[field])
      if (changedElsewhere) {
        draft.recovery = true; this.cancelTimer(draft)
      } else {
        for (const field of fields) if (draft[field] === baseValue(draft.base, field)) draft[field] = baseValue(remote, field)
        draft.base = remote
        if (draft.pendingStatus === remote.status) draft.pendingStatus = undefined
      }
      this.persist(draft)
    }
    this.emit()
  }

  change(id: string, field: Field, value: string) {
    const draft = this.drafts.get(id)
    if (!draft || draft.deleting || this.removed.has(id)) return
    if (!isDirty(draft) && !draft.flight) this.cancelTimer(draft)
    draft[field] = value
    if (!isDirty(draft)) this.cancelTimer(draft)
    this.persist(draft)
    this.schedule(draft)
    this.emit()
  }

  composition(id: string, field: Field, active: boolean) {
    const draft = this.drafts.get(id)
    if (!draft) return
    if (active) draft.composing.add(field)
    else { draft.composing.delete(field); this.schedule(draft) }
  }

  private patch(draft: TodoDraft): TodoPatch {
    const patch: TodoPatch = {}
    if (!draft.composing.has('title') && draft.title !== draft.base.title && validTitle(draft.title)) patch.title = draft.title
    if (!draft.composing.has('description') && draft.description !== draft.base.description && validNotes(draft.description)) patch.description = draft.description
    if (draft.base.today) {
      if (draft.expected !== baseValue(draft.base, 'expected') && validMinutes(draft.expected, true)) patch.expected_daily_minutes = draft.expected === '' ? null : Number(draft.expected)
      if (draft.spent !== baseValue(draft.base, 'spent') && validMinutes(draft.spent)) patch.daily_effort = { date: draft.base.today, minutes: Number(draft.spent) }
    }
    if (draft.pendingStatus !== undefined && draft.pendingStatus !== draft.base.status) patch.status = draft.pendingStatus
    return patch
  }
  private cancelTimer(draft: TodoDraft) { clearTimeout(draft.timer); draft.timer = undefined; draft.due = undefined }
  private blocked(draft: TodoDraft) { return !this.online || draft.recovery || draft.uncertain || !!draft.error || draft.missing || draft.deleting || draft.checking || draft.deleteUncertain }
  private schedule(draft: TodoDraft) {
    if (this.blocked(draft) || draft.flight || draft.timer || !isDirty(draft)) return
    const now = Date.now()
    draft.due ??= Math.max(now + interval, draft.lastStarted + interval)
    if (!Object.keys(this.patch(draft)).length) return
    draft.timer = setTimeout(() => { draft.timer = undefined; void this.write(draft) }, Math.max(0, draft.due - now))
  }

  private async commit(todo?: Todo, removedId?: string) {
    await this.client.cancelQueries({ queryKey: ['todos'] })
    this.client.setQueryData<Todo[]>(todoKey, items => {
      const next = (items ?? []).filter(item => item.id !== (todo?.id ?? removedId))
      if (todo && !this.removed.has(todo.id)) next.push(todo)
      return next.sort((a, b) => b.id.length - a.id.length || b.id.localeCompare(a.id))
    })
  }

  private write(draft: TodoDraft): Promise<void> {
    if (draft.flight) return draft.flight
    if (this.blocked(draft)) return Promise.resolve()
    const input = this.patch(draft)
    if (!Object.keys(input).length) {
      clearTimeout(draft.timer); draft.timer = undefined
      if (!draft.composing.size) draft.due = undefined
      this.emit(); return Promise.resolve()
    }
    this.cancelTimer(draft)
    const started = Date.now()
    draft.lastStarted = started
    draft.sent = input
    draft.flight = (async () => {
      try {
        let saved = await todosApi.patch(draft.base.id, input)
        const response = saved
        if (saved.today !== draft.base.today && draft.spent !== (input.daily_effort ? String(input.daily_effort.minutes) : baseValue(draft.base, 'spent'))) {
          saved = { ...saved, today: draft.base.today, today_spent_minutes: input.daily_effort?.minutes ?? draft.base.today_spent_minutes }
        } else if (saved.today !== draft.base.today) draft.spent = baseValue(saved, 'spent')
        // Never replace the live text: it may be newer than this response.
        for (const field of fields) if (sentValue(input, field) === undefined && draft[field] === baseValue(draft.base, field)) draft[field] = baseValue(saved, field)
        for (const field of ['spent', 'expected'] as const) {
          const sent = sentValue(input, field)
          if (sent !== undefined && Number(draft[field]) === Number(sent) && (field !== 'expected' || (draft[field] === '') === (sent === ''))) draft[field] = baseValue(saved, field)
        }
        draft.base = saved; draft.remote = response
        if (input.status === draft.pendingStatus) draft.pendingStatus = undefined
        draft.sent = undefined
        await this.commit(response)
      } catch (cause) {
        const api = cause instanceof ApiError ? cause : null
        draft.error = api ? Object.values(api.fields).join(' ') || api.message : 'Could not save this todo.'
        draft.uncertain = api?.uncertain ?? true
        draft.missing = api?.status === 404
      } finally {
        draft.flight = undefined
        // Input during a slow request gets the next available five-second slot.
        draft.due = isDirty(draft) ? Math.max(Date.now(), started + interval) : undefined
        this.persist(draft); this.schedule(draft); this.emit()
      }
    })()
    this.persist(draft); this.emit()
    return draft.flight
  }

  async flush(id: string): Promise<boolean> {
    const draft = this.drafts.get(id)
    if (!draft) return true
    this.cancelTimer(draft)
    if (draft.flight) await draft.flight
    if (this.blocked(draft)) return !needsAttention(draft)
    await this.write(draft)
    return !needsAttention(draft)
  }
  async flushAll() { const results = await Promise.all([...this.drafts.keys()].map(id => this.flush(id))); return results.every(Boolean) }

  async setStatus(todo: Todo, status: TodoStatus) {
    const draft = this.ensure(todo)
    if (this.blocked(draft) || draft.pendingStatus !== undefined) return false
    draft.pendingStatus = status; this.persist(draft); this.emit()
    await this.flush(todo.id)
    return draft.base.status === status && draft.pendingStatus === undefined
  }

  setOnline(online: boolean) {
    const reconnecting = !this.online && online
    this.online = online
    if (!online) for (const draft of this.drafts.values()) this.cancelTimer(draft)
    if (reconnecting) for (const [id, draft] of this.drafts) if (needsAttention(draft)) void this.check(id)
    this.emit()
  }

  async check(id: string) {
    const draft = this.drafts.get(id)
    if (!draft || draft.checking || draft.deleting || !this.online) return
    this.cancelTimer(draft)
    draft.checking = true; this.emit()
    if (draft.flight) await draft.flight
    try {
      const items = await todosApi.list('ALL')
      let remote = items.find(item => item.id === id)
      if (!remote) {
        if (draft.deleteUncertain) { await this.forgetDeleted(id); return }
        draft.missing = true; draft.error = 'This todo no longer exists. Copy your draft before dismissing it.'
        return
      }
      draft.remote = remote
      await this.commit(remote)
      if (draft.deleteUncertain) { draft.error = 'Deletion is not confirmed. The original request may still finish. Check again or explicitly retry deletion.'; return }
      const crossedDay = remote.today !== draft.base.today && locallyChanged(draft, 'spent')
      if (crossedDay) remote = { ...remote, today: draft.base.today, today_spent_minutes: draft.base.today_spent_minutes }
      const conflict = fields.some(field => draft[field] !== baseValue(draft.base, field) && baseValue(remote, field) !== baseValue(draft.base, field) && baseValue(remote, field) !== draft[field] && baseValue(remote, field) !== sentValue(draft.sent, field))
      if (draft.pendingStatus === remote.status) draft.pendingStatus = undefined
      if (draft.recovery || conflict || crossedDay && draft.uncertain || (draft.uncertain && (!draft.sent || !Object.entries(draft.sent).every(([key, value]) => key === 'daily_effort' ? remote.today === draft.sent?.daily_effort?.date && remote.today_spent_minutes === draft.sent?.daily_effort?.minutes : remote[key as keyof Todo] === value)))) {
        draft.recovery = true
      } else {
        for (const field of fields) if (!locallyChanged(draft, field)) draft[field] = baseValue(remote, field)
        draft.base = remote; draft.error = ''; draft.uncertain = false; draft.sent = undefined
      }
      return true
    } catch (cause) { draft.error = cause instanceof Error ? cause.message : 'Could not check the server. Your draft is kept.'; return false }
    finally { draft.checking = false; this.persist(draft); this.schedule(draft); this.emit() }
  }

  async resolve(id: string, useDraft: boolean) {
    const draft = this.drafts.get(id)
    if (!draft || draft.checking || draft.flight) return
    // Compare once more before an explicit recovery decision is applied.
    const checked = await this.check(id)
    if (!checked || !draft.remote || draft.missing || draft.checking || draft.deleteUncertain || !this.online) return
    let remote = draft.remote
    if (useDraft && remote.today !== draft.base.today && locallyChanged(draft, 'spent')) remote = { ...remote, today: draft.base.today, today_spent_minutes: draft.base.today_spent_minutes }
    if (!useDraft) { for (const field of fields) draft[field] = baseValue(remote, field); draft.pendingStatus = undefined }
    else {
      // Only locally modified fields should replace the latest remote values.
      for (const field of fields) if (!locallyChanged(draft, field)) draft[field] = baseValue(remote, field)
    }
    draft.base = remote; draft.recovery = false; draft.uncertain = false; draft.error = ''; draft.sent = undefined
    this.persist(draft); this.emit()
    if (useDraft) await this.flush(id)
  }

  async remove(todo: Todo) {
    const draft = this.ensure(todo)
    if (!this.online || draft.deleting || draft.checking) return false
    this.cancelTimer(draft)
    draft.deleting = true; this.persist(draft); this.emit()
    if (draft.flight) await draft.flight
    try {
      await todosApi.remove(todo.id)
      await this.forgetDeleted(todo.id)
      return true
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) { await this.forgetDeleted(todo.id); return true }
      draft.deleteUncertain = cause instanceof ApiError ? cause.uncertain : true
      draft.error = cause instanceof Error ? cause.message : 'Could not delete this todo.'
      return false
    } finally { draft.deleting = false; if (!this.removed.has(todo.id)) this.persist(draft); this.emit() }
  }
  private async forgetDeleted(id: string) {
    this.removed.add(id)
    const draft = this.drafts.get(id)
    if (draft) this.cancelTimer(draft)
    this.drafts.delete(id)
    try { localStorage.removeItem(storagePrefix + id) } catch { this.storageFailed() }
    await this.commit(undefined, id); this.emit()
  }
  dismissMissing(id: string) { const draft = this.drafts.get(id); if (draft?.missing) void this.forgetDeleted(id) }
  async addConfirmed(todo: Todo) { this.removed.delete(todo.id); await this.commit(todo) }
}

const stores = new WeakMap<QueryClient, TodoDraftStore>()
export function todoDraftStore(client: QueryClient) {
  let store = stores.get(client)
  if (!store) { store = new TodoDraftStore(client); stores.set(client, store) }
  return store
}

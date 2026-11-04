import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError, entriesApi, type Entry, type EntryInput } from '../../api/entries'
import { commitEntry, readReplacement, sameInput } from './entriesQueries'

export type Operation = {
  key: string
  kind: 'create' | 'replace' | 'delete'
  original?: Entry
  input?: EntryInput
  status: 'saving' | 'uncertain' | 'checking'
  message: string
  match?: Entry
}
export function useEntryMutations(notify: (message: string) => void) {
  const client = useQueryClient()
  const current = useRef<Record<string, Operation>>({})
  const [pending, setPending] = useState<Record<string, Operation>>({})
  const [completed, setCompleted] = useState<Record<string, number>>({})
  const complete = (key: string) => setCompleted(prev => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }))
  const publish = (key: string, operation?: Operation) => {
    const next = { ...current.current }
    if (operation) next[key] = operation
    else delete next[key]
    current.current = next
    setPending(next)
  }
  const mutation = useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (op: Operation) => {
      if (!navigator.onLine) throw new ApiError('You are offline. Reconnect before saving.', 'OFFLINE')
      if (op.kind === 'create') return entriesApi.create(op.input!)
      if (op.kind === 'replace') return entriesApi.replace(op.original!.id, op.input!)
      try { await entriesApi.remove(op.original!.id) } catch (e) {
        if (!(e instanceof ApiError) || e.reason !== 'ENTRY_NOT_FOUND') throw e
      }
      return null
    },
  })
  async function send(op: Operation): Promise<Entry | null | undefined> {
    publish(op.key, { ...op, status: 'saving', message: 'Saving…', match: undefined })
    try {
      const entry = await mutation.mutateAsync(op)
      await commitEntry(client, entry, op.original?.id)
      publish(op.key)
      complete(op.key)
      return entry
    } catch (error) {
      if (error instanceof ApiError && error.uncertain) {
        publish(op.key, { ...op, status: 'uncertain', message: error.message })
        return undefined
      }
      publish(op.key)
      if (error instanceof ApiError && error.reason === 'ENTRY_NOT_FOUND') await commitEntry(client, null, op.original?.id)
      throw error
    }
  }
  async function submit(kind: Operation['kind'], input?: EntryInput, original?: Entry) {
    const key = original?.id ?? 'create'
    if (current.current[key]) return undefined
    if (kind === 'replace' && sameInput(input!, original!)) return original
    return send({ key, kind, input, original, status: 'saving', message: '' })
  }
  async function check(key: string) {
    const op = current.current[key]
    if (!op || op.status !== 'uncertain') return
    publish(key, { ...op, status: 'checking', message: 'Checking the service…' })
    try {
      if (op.kind === 'replace') {
        const found = await readReplacement(op.original!, op.input!)
        if (found) { await commitEntry(client, found); publish(key); complete(key); notify('Changes confirmed.'); return }
        publish(key, { ...op, status: 'uncertain', message: 'The proposed change is not confirmed. Check again, or retry explicitly. Another device may have edited this entry.' })
      } else {
        const target = op.input ?? op.original!
        const result = await entriesApi.list({ from: target.start_time, to: Math.max(target.start_time + 1, target.end_time) })
        if (op.kind === 'create') {
          const match = result.items.find(e => sameInput(e, target))
          publish(key, { ...op, status: 'uncertain', match, message: match ? 'A matching entry exists. It may be this save or an earlier identical entry. Use it to finish without creating another.' : 'No matching entry was found yet. A delayed save may still arrive. Check again before choosing to retry.' })
        } else {
          const found = result.items.some(e => e.id === op.original!.id)
          publish(key, { ...op, status: 'uncertain', message: found ? 'The entry is still visible. Check again or explicitly retry deletion.' : 'The entry is no longer in its old range, but may have moved. Retry deletion to confirm that this ID is gone.' })
        }
      }
    } catch { publish(key, { ...op, status: 'uncertain', message: 'Could not check the service. Reconnect and check again.' }) }
  }
  async function retry(key: string) {
    const op = current.current[key]
    if (!op || op.status !== 'uncertain') return
    if (!window.confirm(op.kind === 'create' ? 'The previous save may still complete. Retrying can create a duplicate. Save another entry?' : 'Retry this change? It may overwrite changes made on another device.')) return
    try { await send(op) } catch (e) { notify(e instanceof Error ? e.message : 'The request failed.') }
  }
  async function useMatch(key: string) {
    const op = current.current[key]
    if (!op?.match) return
    await commitEntry(client, op.match)
    publish(key)
    complete(key)
    notify('Using the existing matching entry.')
  }
  return { pending, completed, submit, check, retry, useMatch }
}
export type EntryMutations = ReturnType<typeof useEntryMutations>

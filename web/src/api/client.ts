export class ApiError extends Error {
  constructor(message: string, public reason = 'NETWORK', public fields: Record<string, string> = {}, public uncertain = false, public status = 0) {
    super(message)
    this.name = 'ApiError'
  }
}

export const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

export async function request(path: string, method: string, body?: object, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) controller.abort()
  const timer = setTimeout(abort, 15000)
  const writing = method !== 'GET'
  try {
    const response = await fetch(`/api/v1${path}`, {
      method, signal: controller.signal, cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (response.status === 204) return undefined
    const json: unknown = await response.json()
    if (!response.ok) {
      const error = object(json) && object(json.error) ? json.error : {}
      const details = Array.isArray(error.details) ? error.details.filter(object) : []
      const info = details.find(d => d.domain === 'tickmark.peterlitszo' && typeof d.reason === 'string')
      const fields: Record<string, string> = {}
      details.forEach(d => {
        if (Array.isArray(d.fieldViolations)) d.fieldViolations.filter(object).forEach(v => {
          if (typeof v.field === 'string' && typeof v.description === 'string') fields[v.field] = v.description
        })
      })
      const uncertain = writing && response.status >= 500
      const reason = String(info?.reason ?? 'UNKNOWN')
      const message = uncertain ? 'The service could not confirm this change. Check its status before retrying.'
        : reason === 'ENTRY_NOT_FOUND' ? 'This entry no longer exists. It may have been deleted on another device.'
        : reason === 'TODO_NOT_FOUND' ? 'This todo no longer exists. Refresh the list.'
        : reason === 'INVALID_TIME_RANGE' ? 'The end must be on or after the start.'
        : response.status === 400 ? 'Check the highlighted fields and try again.'
        : 'The request failed. Please try again.'
      throw new ApiError(message, reason, fields, uncertain, response.status)
    }
    return json
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError')
    if (error instanceof ApiError) throw error
    throw new ApiError(writing ? 'The connection was interrupted. Your change may have been saved. Check before retrying.' : 'Could not reach Tickmark. Check your connection and try again.', 'NETWORK', {}, writing)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}


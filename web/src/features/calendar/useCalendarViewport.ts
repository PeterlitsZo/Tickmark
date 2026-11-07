import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { shiftDay } from '../../lib/time'
import { BUFFER_DAYS, dayDistance, limitFirstDay, TIME_GUTTER_WIDTH, windowStart } from './calendarWindow'
import { PIXELS_PER_MINUTE } from './timelineGeometry'

export function useCalendarViewport(day: string, onDate: (day: string, replace: boolean) => void) {
  const scroll = useRef<HTMLDivElement>(null)
  const [count, setCount] = useState(() => window.matchMedia('(max-width: 759px)').matches ? 1 : 4)
  const [width, setWidth] = useState(0)
  const [start, setStart] = useState(() => windowStart(limitFirstDay(day, count), count))
  const anchor = useRef(limitFirstDay(day, count))
  const lastPublished = useRef(day)
  const pendingLeft = useRef<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const locked = useRef(false)
  const lockedLeft = useRef(0)
  const lastLeft = useRef(0)
  const adjusting = useRef(false)
  const model = useRef({ start, width, count, onDate })
  model.current = { start, width, count, onDate }
  const days = useMemo(() => Array.from({ length: count + BUFFER_DAYS * 2 }, (_, i) => shiftDay(start, i)), [start, count])

  const settle = useCallback(() => {
    const el = scroll.current
    const state = model.current
    if (!el || !state.width || locked.current || adjusting.current) return
    const index = Math.round(el.scrollLeft / state.width)
    const first = limitFirstDay(shiftDay(state.start, index), state.count)
    anchor.current = first
    // Publish the visible date without interrupting native scroll momentum.
    if (lastPublished.current !== first) {
      lastPublished.current = first
      state.onDate(first, true)
    }
  }, [])

  const onScroll = useCallback(() => {
    const el = scroll.current
    const state = model.current
    if (!el || !state.width || adjusting.current) return
    if (locked.current) { el.scrollLeft = lockedLeft.current; return }
    // Vertical scrolling must never snap dates or publish a URL change.
    if (Math.abs(el.scrollLeft - lastLeft.current) < .1) return
    lastLeft.current = el.scrollLeft
    const index = el.scrollLeft / state.width
    anchor.current = limitFirstDay(shiftDay(state.start, Math.round(index)), state.count)
    const nextStart = windowStart(anchor.current, state.count)
    if ((index < 1.5 || index > BUFFER_DAYS * 2 - 1.5) && nextStart !== state.start) {
      pendingLeft.current = el.scrollLeft + dayDistance(nextStart, state.start) * state.width
      adjusting.current = true
      setStart(nextStart)
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(settle, 160)
  }, [settle])

  useLayoutEffect(() => {
    const el = scroll.current
    if (!el || !width) return
    el.scrollLeft = pendingLeft.current ?? dayDistance(start, anchor.current) * width
    lastLeft.current = el.scrollLeft
    pendingLeft.current = null
    adjusting.current = false
  }, [start, width, count])

  useLayoutEffect(() => {
    const el = scroll.current
    if (!el) return
    el.scrollTop = 8 * 60 * PIXELS_PER_MINUTE
    const measure = () => {
      const nextCount = window.matchMedia('(max-width: 759px)').matches ? 1 : 4
      const nextWidth = Math.max(1, (el.clientWidth - TIME_GUTTER_WIDTH) / nextCount)
      const state = model.current
      if (nextCount === state.count && Math.abs(nextWidth - state.width) < .1) return
      clearTimeout(timer.current)
      const fraction = state.width ? el.scrollLeft / state.width - dayDistance(state.start, anchor.current) : 0
      anchor.current = limitFirstDay(anchor.current, nextCount)
      const nextStart = windowStart(anchor.current, nextCount)
      pendingLeft.current = (dayDistance(nextStart, anchor.current) + fraction) * nextWidth
      setCount(nextCount)
      setStart(nextStart)
      setWidth(nextWidth)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const goTo = useCallback((target: string) => {
    const { count, start, width } = model.current
    clearTimeout(timer.current)
    const first = limitFirstDay(target, count)
    anchor.current = first
    lastPublished.current = first
    const nextStart = windowStart(first, count)
    pendingLeft.current = null
    adjusting.current = nextStart !== start
    setStart(nextStart)
    const el = scroll.current
    if (el && nextStart === start) {
      el.scrollLeft = dayDistance(nextStart, first) * width
      lastLeft.current = el.scrollLeft
    }
  }, [])

  useLayoutEffect(() => {
    if (day === lastPublished.current && day === limitFirstDay(day, count)) return
    const first = limitFirstDay(day, count)
    goTo(first)
    if (day !== first) onDate(first, true)
  }, [day, count, onDate, goTo])

  useEffect(() => {
    const el = scroll.current
    if (!el) return
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return
      const horizontal = event.deltaX || (event.shiftKey ? event.deltaY : 0)
      if (!horizontal) return
      if (locked.current) { event.preventDefault(); return }
      // Browsers that already translate Shift+wheel provide deltaX. Use it once.
      if (event.shiftKey || event.deltaMode !== 0) {
        event.preventDefault()
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientWidth - TIME_GUTTER_WIDTH : 1
        el.scrollLeft += horizontal * unit
      }
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => { el.removeEventListener('wheel', wheel); clearTimeout(timer.current) }
  }, [])

  const onGesture = useCallback((active: boolean) => {
    locked.current = active
    if (active) {
      clearTimeout(timer.current)
      lockedLeft.current = scroll.current?.scrollLeft ?? 0
    } else {
      timer.current = setTimeout(settle, 160)
    }
  }, [settle])

  return { scroll, days, count, width, onScroll, onGesture, goTo }
}

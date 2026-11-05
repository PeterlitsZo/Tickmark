import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { shiftDay, today, validDay } from '../lib/time'

export function DateNavigator({ day, zone, onDate, inert }: { inert?: boolean; day: string; zone: string; onDate: (day: string) => void }) {
  const [month, setMonth] = useState(day.slice(0, 7))
  const first = new Date(`${month}-01T12:00:00Z`)
  const start = first.getUTCDay()
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  const heading = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  function move(amount: number) {
    const d = new Date(first)
    d.setUTCMonth(d.getUTCMonth() + amount)
    const next = d.toISOString().slice(0, 7)
    if (next >= '1970-01' && next <= '9999-12') setMonth(next)
  }
  return <aside className="sidebar" inert={inert}>
    <div className="mini-calendar">
      <div className="month-heading"><h2>{heading}</h2><div className="row"><button className="icon-button" aria-label="Previous month" onClick={() => move(-1)}><ChevronLeft size={17} /></button><button className="icon-button" aria-label="Next month" onClick={() => move(1)}><ChevronRight size={17} /></button></div></div>
      <div className="month-grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((name, i) => <span className="weekday" key={i}>{name}</span>)}
        {Array.from({ length: start }, (_, i) => <span key={`blank${i}`} />)}
        {Array.from({ length: count }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, '0')}`
          return <button key={date} disabled={!validDay(date)} className={`day-cell ${date === day ? 'selected' : ''} ${date === today(zone) ? 'is-today' : ''}`} aria-label={date} aria-current={date === day ? 'date' : undefined} onClick={() => onDate(date)}>{i + 1}</button>
        })}
      </div>
    </div>
  </aside>
}
export function DayControls({ day, zone, onDate }: { day: string; zone: string; onDate: (day: string) => void }) {
  return <div className="day-controls">
    <button className="secondary" onClick={() => onDate(today(zone))}>Today</button>
    <button className="icon-button bordered" aria-label="Previous day" onClick={() => onDate(shiftDay(day, -1))}><ChevronLeft size={16} /></button>
    <button className="icon-button bordered" aria-label="Next day" onClick={() => onDate(shiftDay(day, 1))}><ChevronRight size={16} /></button>
  </div>
}

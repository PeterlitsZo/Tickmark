import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { filterHelp, helpSections, type HelpSection } from '../../../../shared/todoFilters'
import styles from './TodoPanel.module.css'
export function TodoFilterHelp({ onClose, onUse }: { onClose: () => void; onUse: (expression: string) => void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  const entries = useRef<HTMLDivElement>(null)
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])
  const [section, setSection] = useState<HelpSection>('Examples')
  const [notice, setNotice] = useState('')
  return <aside className={styles.filterHelp} aria-label="Expression guide">
    <header><h3 ref={heading} tabIndex={-1}>Expression guide</h3><button type="button" onClick={onClose}><X size={16} /> Close help</button></header>
    <p>Write a condition. Todos that match it appear in this tab. Filters use saved todo values.</p>
    <nav aria-label="Expression guide sections">{helpSections.map(item => <button type="button" key={item} aria-current={section === item ? 'page' : undefined} onClick={() => { setSection(item); setNotice(''); entries.current?.scrollTo({ top: 0 }) }}>{item}</button>)}</nav>
    <div ref={entries} className={styles.helpEntries} tabIndex={0} role="region" aria-label={`${section} documentation`}>{filterHelp[section].map(entry => <section key={entry.title}>
      <h4>{entry.title}</h4><p>{entry.text}</p>
      {entry.code && <><pre><code>{entry.code}</code></pre><div className={styles.helpActions}>
        <button type="button" onClick={() => { void navigator.clipboard.writeText(entry.code!).then(() => setNotice('Copied.'), () => setNotice('Copy unavailable. Select the expression to copy it.')) }}>Copy</button>
        {section === 'Examples' && <button type="button" onClick={() => onUse(entry.code!)}>Use example</button>}
      </div></>}
    </section>)}</div>
    <p role="status">{notice}</p>
    <p>Examples replace the expression; they do not save the tab.</p>
  </aside>
}

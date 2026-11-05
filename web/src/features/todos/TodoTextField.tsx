import type { TextareaHTMLAttributes } from 'react'
import styles from './TodoPanel.module.css'

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string
  kind: 'title' | 'notes'
  expanded?: boolean
  completed?: boolean
}

export function TodoNotesPreview({ value, onOpen }: { value: string; onOpen: () => void }) {
  if (!value) return null
  return <div className={styles.previewBody}>
    <button className={styles.previewButton} onClick={onOpen}><span className={styles.previewText}>{value}</span></button>
  </div>
}

// The mirror sizes the field and paints the clamped preview. A transparent
// textarea above it keeps native hit-testing and selection in browsing mode.
// Expansion changes only presentation, never the input node or its selection.
export function TodoTextField({ value, kind, expanded = true, completed = false, ...props }: Props) {
  return <div className={`${styles.textField} ${kind === 'title' ? styles.titleField : styles.notesField} ${completed ? styles.completed : ''}`} data-expanded={expanded} hidden={kind === 'notes' && !expanded && !value}>
    <div className={styles.textSurface}>
      <span className={styles.textMeasure} aria-hidden="true">{value || props.placeholder}{'\u200b'}</span>
      <textarea {...props} value={value} rows={1} draggable={false} onDragStart={event => event.preventDefault()} onBlur={event => {
        // Do not revive a previous selection on the next mouse press. Never
        // touch the selection while this field is focused or being dragged.
        const node = event.currentTarget
        node.setSelectionRange(node.selectionEnd, node.selectionEnd)
        node.scrollTop = 0
        props.onBlur?.(event)
      }} />
    </div>
  </div>
}

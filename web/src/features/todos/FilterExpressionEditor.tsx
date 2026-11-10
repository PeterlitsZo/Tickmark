import { useImperativeHandle, useMemo, useRef, type Ref } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { StreamLanguage } from '@codemirror/language'

export type ExpressionEditorHandle = {
  focus: () => void
  getSelection: () => { start: number; end: number }
  setSelectionRange: (start: number, end: number) => void
}

// Lexical highlighting only. The server remains the expression validator.
const language = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null
    if (stream.match(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/)) return 'string'
    if (stream.match(/\b(?:AND|OR|NOT|IN|true|false)\b/)) return 'keyword'
    if (stream.match(/\b\d+(?:\.\d+)?\b/)) return 'number'
    if (stream.match(/[A-Za-z_][\w:]*/)) return 'variableName'
    if (stream.match(/[=!<>+*/-]+/)) return 'operator'
    stream.next()
    return null
  },
  languageData: { closeBrackets: { brackets: ['(', '[', "'", '"'] } },
})
const theme = EditorView.theme({
  '&': { border: '1px solid var(--line-strong)', borderRadius: '6px', backgroundColor: 'var(--surface)', color: 'var(--ink)', overflow: 'hidden' },
  '&.cm-focused': { outline: '2px solid var(--accent)', outlineOffset: '1px' },
  '.cm-scroller': { fontFamily: 'ui-monospace, monospace', fontSize: '14px', lineHeight: '1.7', overflow: 'auto', scrollbarWidth: 'thin' },
  '.cm-content': { padding: '10px 0', caretColor: 'var(--ink)' },
  '.cm-line': { padding: '0 12px' },
  '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--muted)', borderRight: '1px solid var(--line)' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--accent) 5%, transparent)' },
})
const setup = { foldGutter: false, highlightActiveLine: true, autocompletion: false }

export function FilterExpressionEditor({ ref, value, onChange, disabled, errorId }: {
  ref: Ref<ExpressionEditorHandle>; value: string; onChange: (value: string) => void; disabled: boolean; errorId?: string
}) {
  const editor = useRef<ReactCodeMirrorRef>(null)
  const extensions = useMemo(() => [language, theme, EditorView.contentAttributes.of({
    id: 'filter-expression', 'aria-label': 'Filter expression', 'aria-required': 'true',
    ...(errorId ? { 'aria-describedby': errorId, 'aria-invalid': 'true' } : {}),
  })], [errorId])
  useImperativeHandle(ref, () => ({
    focus: () => editor.current?.view?.focus(),
    getSelection: () => { const s = editor.current?.view?.state.selection.main; return { start: s?.anchor ?? 0, end: s?.head ?? 0 } },
    setSelectionRange: (start, end) => {
      const view = editor.current?.view
      if (view) view.dispatch({ selection: { anchor: Math.min(start, view.state.doc.length), head: Math.min(end, view.state.doc.length) } })
    },
  }), [])
  return <CodeMirror ref={editor} value={value} onChange={onChange} height="200px" extensions={extensions}
    basicSetup={setup} editable={!disabled} readOnly={disabled} indentWithTab={false} />
}

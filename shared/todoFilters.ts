// Platform-independent wire contract and expression help, shared by both clients.
export type SavedTodoFilter = { id: string; name: string; filter_expr: string; position: number; created_at: number; updated_at: number }
export type TodoFilterInput = Pick<SavedTodoFilter, 'name' | 'filter_expr'>
export function isSavedTodoFilter(value: unknown): value is SavedTodoFilter {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.id === 'string' && /^[1-9]\d*$/.test(v.id) && typeof v.name === 'string' && typeof v.filter_expr === 'string' && Number.isSafeInteger(v.position) && Number.isSafeInteger(v.created_at) && Number.isSafeInteger(v.updated_at)
}
export function filterInputError(input: TodoFilterInput): string {
  if (![...input.name.trim()].length || [...input.name.trim()].length > 60) return 'Use 1–60 characters for the tab name.'
  if (!input.filter_expr.trim()) return 'Enter a condition, or use All to see every todo.'
  if (new TextEncoder().encode(input.filter_expr).length > 4096) return 'Use 4096 UTF-8 bytes or fewer for the expression.'
  return ''
}
export function encodeFilter(expression: string): string {
  const bytes = new TextEncoder().encode(expression)
  if (bytes.length > 4096) throw new Error('Use 4096 UTF-8 bytes or fewer for the expression.')
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export const helpSections = ['Examples', 'Fields', 'Syntax', 'Troubleshooting'] as const
export type HelpSection = typeof helpSections[number]
export type HelpEntry = { title: string; text: string; code?: string }
export const filterHelp: Record<HelpSection, HelpEntry[]> = {
  Examples: [
    { title: 'Open todos', text: 'Show unfinished tasks.', code: "status = 'OPEN'" },
    { title: 'Completed todos', text: 'Show tasks you have finished.', code: "status = 'COMPLETED'" },
    { title: 'Find a word in the title', text: 'Match text anywhere in the title. Matching is case-sensitive. Chinese text works too: replace Work with 工作.', code: "title.contains('Work')" },
    { title: 'Open work tasks', text: 'Both conditions must match: the task is open and its title starts with Work /.', code: "status = 'OPEN' AND title.starts_with('Work /')" },
    { title: 'Search titles or notes', text: 'Find review in either field, ignoring letter case.', code: "title.to_lowercase().contains('review') OR description.to_lowercase().contains('review')" },
    { title: 'Tasks without notes', text: 'An empty description is an empty string.', code: "description = ''" },
  ],
  Fields: [
    { title: 'title · Text', text: 'The todo title.', code: "title.contains('Work')" },
    { title: 'description · Text', text: 'The todo notes; an empty string when no notes exist.', code: "description = ''" },
    { title: 'status · Text', text: 'OPEN or COMPLETED. Values are case-sensitive and must be quoted.', code: "status = 'OPEN'" },
    { title: 'id · Text', text: 'The todo identifier. Quote it even when it looks numeric.', code: "id = '12'" },
    { title: 'created_at · Integer', text: 'Creation time in Unix seconds from 1970-01-01 00:00:00 UTC. 1767225600 means 2026-01-01 00:00:00 UTC. Use unquoted seconds, not milliseconds. This is not a due date.', code: 'created_at >= 1767225600' },
    { title: 'updated_at · Integer', text: 'Last update time, also in Unix seconds.', code: 'updated_at >= 1767225600' },
  ],
  Syntax: [
    { title: 'Text and numbers', text: 'Quote text with single or double quotes. Leave field names and numbers unquoted. Text matching is case-sensitive.', code: "title = 'Review proposal' AND created_at >= 1767225600" },
    { title: 'Quotes inside text', text: 'Use the other quote style, or escape a quote with a backslash.', code: 'title.contains("It\'s ready")\ntitle.contains(\'It\\\'s ready\')' },
    { title: 'Compare values', text: '= or == means equal; != means not equal. Use >, >=, < and <= for comparisons. IN checks membership in an array.', code: "status IN ['OPEN', 'COMPLETED']" },
    { title: 'Combine conditions', text: 'AND requires both conditions. OR requires either. NOT excludes a match. Parentheses make grouping explicit.', code: "status = 'OPEN' AND (title.contains('Work') OR title.contains('Study'))\nNOT title.contains('Archived')" },
    { title: 'Text methods', text: 'contains finds text anywhere; starts_with checks the beginning; ends_with checks the end. to_lowercase ignores case when combined with a lowercase search value. trim removes surrounding whitespace for this comparison. These methods do not modify todos.', code: "title.starts_with('Work /')\ntitle.ends_with('?')\ntitle.to_lowercase().contains('review')\ndescription.trim() = ''" },
    { title: 'Regular expressions', text: 'matches checks a regular-expression pattern. This example matches titles starting with Review or Check.', code: "matches(title, '^(Review|Check)')" },
  ],
  Troubleshooting: [
    { title: 'The expression could not be parsed', text: 'Check quotes and parentheses. Quote status values.', code: "status = 'OPEN'" },
    { title: 'A field could not be found', text: 'Check the Fields section. For example, use title, not name.' },
    { title: 'A value has the wrong type', text: 'Text needs quotes; timestamp numbers do not. The id field is text.' },
    { title: 'The expression is not a condition', text: 'A filter must produce true or false. Use a comparison or a text check, not a bare title.', code: "title.contains('Work')" },
    { title: 'No todos match', text: 'This is not an error. Check spelling, letter case and saved todo values. Try one condition at a time.' },
    { title: 'A saved filter now fails', text: 'New or updated todos can expose an expression error. Edit the filter and check the reported details.' },
    { title: 'The service cannot be reached', text: 'Your expression may be fine. Keep your draft and retry when connected.' },
    { title: 'Expression limits', text: 'Use up to 4096 UTF-8 bytes. Chinese and other characters can use multiple bytes. Saving checks syntax and available todos, but cannot guarantee that every future todo will evaluate successfully.' },
  ],
}

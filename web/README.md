# Tickmark web

A React browser client for recording completed activities and managing todos. The horizontally scrollable calendar shows four days on desktop and one readable day on narrow screens. It supports pointer selection, moving and resizing entries, keyboard-accessible editing, and an inline editor alongside a persistent todo list. It uses TanStack Router, Query and Form, TypeScript, Vite, and the existing Rust API.

## Preview with the existing service

```sh
npm --prefix web ci
npm --prefix web run dev
```

Open the URL printed by Vite. API requests are proxied to `https://tickmark.peterlits.me`, so the preview shows the same records as the existing client. Saving and deleting from this preview changes real service data. The browser uses relative `/api` URLs; the development proxy avoids requiring browser CORS support.

Production builds also use relative API URLs and are served together with the existing Worker. The development proxy is not included in the deployed frontend.

## Isolated local development

Requirements: Node.js 22.12+ (or 24+), npm, and the Rust / worker-build tools described in `../server/README.md`.

From the repository root:

```sh
npm --prefix web ci
npm --prefix server ci
npm --prefix web run build
npm --prefix server run db:migrate:web
npm --prefix server run dev:web
```

Open http://localhost:8791. This serves the production frontend and Rust API from the same Worker using an isolated local D1 database under `server/.wrangler/web-local`. It uses the tracked example config; it never connects to production D1.

For frontend hot reload, keep the Worker running and start another terminal:

```sh
TICKMARK_DEV_API=http://127.0.0.1:8791 npm --prefix web run dev
```

Open the URL printed by Vite (usually http://127.0.0.1:5173). This explicit override proxies `/api` to the isolated local Worker instead of the existing service. Set `TICKMARK_DEV_API` to another origin when needed.

After rebuilding `web/dist` while Wrangler is already running, restart Wrangler before checking the packaged site: the local asset manifest may still refer to the previous hashed filenames. Vite hot reload does not require restarting the Worker. `vite preview` alone does not provide the API.

## Combined build and deployment

```sh
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix server run build:local
```

`build:local` builds the frontend, compiles Rust to Wasm, and runs a Wrangler deployment dry run using the example configuration. It requires no remote database or deployment.

For the configured production target, `npm --prefix server run build` uses `server/cloudflare-worker/wrangler.jsonc`. `npm --prefix server run deploy` builds the frontend and publishes it together with the Worker. Follow the server README to configure the target first. The category UI requires the existing server category API and migration `0003`; apply pending server migrations before serving this client. This Web change adds no further migration.

Static assets are uploaded with the Worker. Existing assets are served by the platform; `/api` and `/api/*` always execute the Rust handler. The Rust handler serves `index.html` through the `ASSETS` binding for page navigation, while missing scripts return 404. HTML is revalidated, hashed assets are immutable, and API responses use `no-store`. Roll back the entire Worker deployment to keep HTML, chunks and Wasm aligned.

## Layout

Desktop keeps Todos in the right column. Selecting or creating a time block opens its details underneath the list; closing the editor gives the space back to Todos. The list and editor fields scroll independently, while the todo heading, add input, and editor actions remain accessible. Opening details does not resize the desktop timeline.

Below 760 CSS pixels, the same workspace sits below the timeline. Todos can be collapsed to give the calendar more space. Opening entry details expands the bottom workspace while keeping the calendar and todos available; there is no modal or tab switch. The selected block is kept in view when the timeline height changes. Drafts survive resizing and collapsing the panel.

The time scale is 96px per hour. A draft stays visible during creation and follows edits to its time range and category. Global notices appear over the calendar, away from editor actions. Field validation stays next to its input. The header has Today, previous/next day, refresh and add controls, plus a category-management shortcut when the sidebar is hidden.

The screenshots in `docs/refinement/` document the earlier calendar layout; see `VALIDATION.md` for the current integrated workspace verification.

## Interaction and data rules

- Use Shift + mouse wheel, horizontal trackpad scrolling, or touch swipes to browse past and future dates. Ordinary wheel input scrolls time vertically. The calendar keeps a shared vertical position as dates change without snapping after horizontal scrolling settles. Scrollbars are hidden.
- Desktop displays four equal day columns; below 760px it displays one. Date headers stay at the top, and the time gutter stays on the left. Only the visible days and four buffer days on each side are mounted. Each local day has its own cached query, loading state and retry action.
- Today, previous/next day and the month navigator move the visible date window. The URL stores the first visible day. Scrolling replaces that history entry; explicit navigation creates history entries. At the upper supported date limit, the desktop window ends on 9999-12-30. Resizing preserves the date anchor.
- Date browsing keeps entry drafts, pending saves and todo input mounted. The Add entry button uses the first visible day; clicking or selecting a column uses that column’s date. Leaving the calendar page still uses the existing unsaved-change guards.
- Click Add entry or drag an empty time range. Mouse selections snap to five minutes; a click creates a fifteen-minute draft. Touch scrolling remains available; long press activates selection where the browser permits it. The Add button and editor are always alternatives to gestures.
- Click an entry to edit. Drag its body to move it, or its top/bottom handle to resize it. Moving preserves duration and seconds. Cross-day fragments are display-only; only actual endpoints have handles. A changed drag writes once on release. Horizontal browsing is held while dragging so the day cannot change underneath the gesture. Cross-column dragging is not supported. Escape, pointer cancellation and window blur cancel a drag.
- Keyboard users can focus any entry with Tab, open it with Enter, and edit its times without dragging. Short entries retain accessible labels and hover titles.
- Save or Enter in the title field submits the form; IME confirmation does not submit. Closing a changed draft asks before discarding it. Delete requires confirmation and is permanent. Navigation away from the calendar is blocked for dirty drafts; browser unload prompts are subject to browser restrictions.
- All times use the browser's IANA time zone, shown in the interface. Day boundaries support DST. Clock-change days retain their actual 23/25-hour duration, show their own local hour labels with UTC offsets, and use elapsed-time geometry; adjacent normal days retain their ordinary hour scale. Repeated local hours offer an explicit UTC offset choice; nonexistent times are rejected. Title-only edits preserve exact timestamps.
- Block height follows the exact clipped duration. Only actual time intersections create overlap columns; touching endpoints do not overlap. Very short blocks expose their full label on hover and through accessible names, rather than inflating their displayed duration.
- Overlaps and zero-duration records are valid. IDs stay strings. Titles use Unicode scalar counting and server-compatible whitespace trimming.
- The query cache is memory-only. Reads refresh when stale on window focus/reconnection; Refresh is also available. There is no live subscription, persisted offline cache or offline write queue.
- Writes never automatically retry. An uncertain save keeps the record locked with its proposed times. Check status reads the original and target ranges. A create check may find an identical record but cannot prove it came from that request; choose Use existing entry explicitly. Retrying a create can duplicate a delayed save. Retrying edits can overwrite concurrent changes.
- Pending operations survive changing the selected date within the calendar, but not a page reload. Unload warnings help avoid losing that context. Drafts survive recoverable request failures within the current page session only.
- Entries with timestamps outside the browser date editor's supported range are reported without rewriting their data. Calendar navigation supports 1970-01-02 through 9999-12-30.

The API remains unauthenticated and has no per-user isolation. All clients using the same service access the same entries. Serving the UI and API together does not change that behavior.

## Todos

Todos share a stable list in the calendar; completing an item does not move it. Quick-add remains an explicit Enter/button action. Titles and notes are editable in place, with no duplicate heading or Save/Cancel form. Notes use smaller, muted text and a two-line preview. On narrow screens, editing opens an accessible full-height modal with a back action and save status.

Text saves use a per-todo five-second throttle, not a debounce: continued typing does not postpone the first write. Only changed fields are PATCHed, each todo has one request in flight, and newer input survives older responses. Leaving a task, collapsing the panel, or navigating flushes pending changes. Completion is immediate and serialized with text writes. Titles accept 1–500 Unicode scalar values; notes accept 0–10,000. Invalid fields and IME compositions remain local while other valid fields may save.

Unacknowledged drafts are stored locally with their server baseline. Reload recovery and conflicting remote changes require an explicit comparison. Failed or uncertain writes stop automatic retries; checking the server precedes retry or recovery. Reconnecting also reads before writing. Missing todos retain copyable drafts, and deletion waits for an in-flight save before removing the task. Browser-storage failures are reported; unload protection does not depend on a final asynchronous request. Calendar-entry drafts remain independent.

## Source map

- `src/routes/`, `src/router.tsx`: typed routes and URL date state.
- `src/api/client.ts`: shared cancellation, timeout and structured errors.
- `src/api/entries.ts`, `src/api/todos.ts`: response validation and CRUD.
- `src/features/todos/`: persistent todo panel, inline notes, per-task autosave and recovery.
- `src/features/entries/`: TanStack Form editor, query options, cache commits, and uncertain-write recovery.
- `src/features/calendar/`: page layout (CSS Modules), timeline geometry and pointer interactions.
- `src/lib/time.ts`: explicit-zone calendar calculations, civil-time resolution and validation.
- `src/components/`: month/day navigation and the shared notification host.
- `src/styles/`: visual tokens and responsive styles.
- `public/icon.svg`: the existing mobile Timeline mark.

No automated tests or test dependencies were added, following AGENTS.md. See `VALIDATION.md` for actual verification and remaining device limitations.

## Entry categories

Manage categories from the desktop sidebar, compact calendar header, or entry category field. Each category has an editable name and one of RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE, PINK, GRAY. The frontend maps these semantic enum values to readable colors; the API never receives CSS colors. Names use server-compatible whitespace trimming and a 1–100 Unicode scalar limit. Duplicate names are allowed and distinguished with IDs in options and management rows.

New entries prefer the category of the last successfully created entry, stored in this browser’s localStorage, and normally send it explicitly. If no remembered category exists in the loaded list, they select the lowest numeric category ID. Cancelled or failed drafts and edits to existing entries do not change this preference. Confirming an existing match after an uncertain create also remembers its category. Storage failures fall back safely without blocking saves. If a successful category read returns an empty list, saving an entry omits the ID so the server atomically creates `Default` / `GRAY`. Loading or failed reads do not count as an empty list. Editing and dragging preserve the selected category; missing categories require an explicit replacement while retaining the draft.

Time blocks show the category badge immediately before the title. All durations use the same badge dimensions, with title ellipsis and a container-relative cap for long category names. Very short fragments retain full accessible labels. Category renames and color changes update the shared cache, so loaded dates use the new mapping without rewriting entries. Unknown future colors render neutrally and remain unchanged by name-only edits.

Deletion requires confirmation and is refused when any time entry references the category, including entries on other dates. Uncertain category writes never retry automatically. Refresh/check before explicitly retrying; a same-name row cannot prove a create succeeded. Category drafts survive recoverable failures in the current page session. Explicitly stopping request tracking does not cancel an already-sent request.

See `../plans/20261105/03/` for the original concepts, updated design decisions, and implementation screenshots; see `VALIDATION.md` for browser checks and limitations.

### Todo interaction architecture

`useTodoInteraction` coordinates focus and pointer gestures once per panel. Focus determines the edited task; pointer gestures postpone layout changes until release, while keyboard focus updates immediately. Leaving a task flushes its draft independently of visual expansion. Rows do not install global event listeners or maintain competing edit state.

`TodoTextField` keeps a stable native textarea for browser selection and uses a hidden text mirror for intrinsic CSS sizing, including trailing newlines. There is no zero-height measurement, ResizeObserver, pointer-down cancellation, or click-coordinate caret reconstruction. A field collapses its previous selection only after blur, and selected-text drag-and-drop is disabled without intercepting selection gestures. `TodoEditor` renders fields and task actions; `TodoFeedback` renders exceptional save/recovery feedback; `TodoSheet` owns the mobile dialog lifecycle. The existing draft store continues to own persistence, throttling, and recovery.

## Entry descriptions

Entries have an optional plain-text Description below Title. Save entry / Save changes explicitly saves the whole form, including whitespace and line breaks; clearing Description sends an empty string. Enter in Description inserts a newline, while Enter in Title saves. Unsaved descriptions participate in the existing Cancel, Escape, record-switching, navigation and unload guards. Todos retain their independent inline autosave flow.

The limit is 10,000 Unicode scalar values (emoji count as one scalar where applicable), counted with `Array.from`. Oversized input is retained for correction and cannot be submitted. Descriptions are shown in the editor, without changing calendar block heights.

Below 760px, the same editor becomes a full-height modal dialog with a scrollable field area, fixed actions, focus containment/restoration, safe-area padding and VisualViewport sizing. Category management opens above it without resetting the draft. Errors and pending-save recovery controls remain inside the editor, including on narrow screens.

This frontend requires the entry-description API and migration `0005_add_time_entry_description.sql`. Every returned entry must include a string `description`; missing or invalid fields are protocol errors. An unreadable write response remains uncertain until checked or explicitly retried. Time-only drag/resize requests omit description so the server atomically preserves the latest value. Confirmation compares descriptions only when they were sent; create candidates must also match the expected description exactly.

See [validation results](VALIDATION.md#entry-descriptions-and-responsive-editor--2026-11-06) for local integration checks, screenshots and device coverage limits.

## Four-day calendar verification

See `../plans/20261107/01/` for the design, implementation screenshots and manual verification record. No automated test files or test dependencies were added.

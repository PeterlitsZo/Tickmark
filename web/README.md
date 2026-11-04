# Tickmark web

A React browser client for recording completed activities. The single-day calendar supports pointer selection, moving and resizing entries, keyboard-accessible editing, and a responsive full-screen editor on small screens. It uses TanStack Router, Query and Form, TypeScript, Vite, and the existing Rust API.

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

For the configured production target, `npm --prefix server run build` uses `server/cloudflare-worker/wrangler.jsonc`. `npm --prefix server run deploy` builds the frontend and publishes it together with the Worker. Follow the server README to configure the target first. No new schema migration is required by the web client.

Static assets are uploaded with the Worker. Existing assets are served by the platform; `/api` and `/api/*` always execute the Rust handler. The Rust handler serves `index.html` through the `ASSETS` binding for page navigation, while missing scripts return 404. HTML is revalidated, hashed assets are immutable, and API responses use `no-store`. Roll back the entire Worker deployment to keep HTML, chunks and Wasm aligned.

## Layout

Desktop uses a permanent details column: creating, editing, saving and cancelling do not resize the timeline. Below 760 CSS pixels, the editor overlays the calendar and makes its background inert. The time scale is 96px per hour. A gray draft stays visible during creation and follows edits to its time range.

Global notices and uncertain-write recovery controls appear at the bottom right without moving the calendar. Field validation stays next to the affected input. Routine successful writes do not create extra notifications. The header has Today, previous/next day, refresh and add controls; it has no native date-picker trigger.

See [current UI screenshots](docs/refinement/README.md) for isolated examples.

## Interaction and data rules

- Use Today, previous/next day, or the desktop month navigator. The selected date is stored in the URL and restored by browser history.
- Click Add entry or drag an empty time range. Mouse selections snap to five minutes; a click creates a fifteen-minute draft. Touch scrolling remains available; long press activates selection where the browser permits it. The Add button and editor are always alternatives to gestures.
- Click an entry to edit. Drag its body to move it, or its top/bottom handle to resize it. Moving preserves duration and seconds. Cross-day fragments are display-only; only actual endpoints have handles. A changed drag writes once on release. Escape, pointer cancellation and window blur cancel a drag.
- Keyboard users can focus any entry with Tab, open it with Enter, and edit its times without dragging. Short entries retain accessible labels and hover titles.
- Save or Enter in the title field submits the form; IME confirmation does not submit. Closing a changed draft asks before discarding it. Delete requires confirmation and is permanent. Browser navigation is blocked for dirty drafts; browser unload prompts are subject to browser restrictions.
- All times use the browser's IANA time zone, shown in the interface. Day boundaries support DST. Repeated local hours offer an explicit UTC offset choice; nonexistent times are rejected. Title-only edits preserve exact timestamps.
- Block height follows the exact clipped duration. Only actual time intersections create overlap columns; touching endpoints do not overlap. Very short blocks expose their full label on hover and through accessible names, rather than inflating their displayed duration.
- Overlaps and zero-duration records are valid. IDs stay strings. Titles use Unicode scalar counting and server-compatible whitespace trimming.
- The query cache is memory-only. Reads refresh when stale on window focus/reconnection; Refresh is also available. There is no live subscription, persisted offline cache or offline write queue.
- Writes never automatically retry. An uncertain save keeps the record locked with its proposed times. Check status reads the original and target ranges. A create check may find an identical record but cannot prove it came from that request; choose Use existing entry explicitly. Retrying a create can duplicate a delayed save. Retrying edits can overwrite concurrent changes.
- Pending operations survive changing the selected date within the calendar, but not a page reload. Unload warnings help avoid losing that context. Drafts survive recoverable request failures within the current page session only.
- Entries with timestamps outside the browser date editor's supported range are reported without rewriting their data. Calendar navigation supports 1970-01-02 through 9999-12-30.

The API remains unauthenticated and has no per-user isolation. All clients using the same service access the same entries. Serving the UI and API together does not change that behavior.

## Source map

- `src/routes/`, `src/router.tsx`: typed routes and URL date state.
- `src/api/entries.ts`: cancellation, timeout, response validation, structured errors and CRUD.
- `src/features/entries/`: TanStack Form editor, query options, cache commits, and uncertain-write recovery.
- `src/features/calendar/`: page layout (CSS Modules), timeline geometry and pointer interactions.
- `src/lib/time.ts`: explicit-zone calendar calculations, civil-time resolution and validation.
- `src/components/`: month/day navigation and the shared bottom-right notification host.
- `src/styles/`: visual tokens and responsive styles.
- `public/icon.svg`: the existing mobile Timeline mark.

No automated tests or test dependencies were added, following AGENTS.md. See `VALIDATION.md` for actual verification and remaining device limitations.

# Todo backend validation — 2026-11-05

For the latest time-entry description verification, see the final section dated
2026-11-06. Earlier body-limit observations describe their historical revisions.

Validation used Rust 1.97.1, Worker SDK 0.8.7, Wrangler 4.157.0, and the
tracked example configuration. All database changes were local. No remote
migrations, deployments, application tests, or test scripts were added or run.

## Build checks

The following commands passed from `server/`:

```sh
cargo fmt --all -- --check
cargo check -p tickmark-core --locked
cargo clippy -p tickmark-core --locked -- -D warnings
cargo check -p tickmark-cloudflare-worker --target wasm32-unknown-unknown --locked
npm run build:local
```

Worker Clippy with `--target wasm32-unknown-unknown -- -D warnings` also passed.
The combined build includes frontend type checking, Vite compilation, release
Wasm compilation, wasm-opt, and a Wrangler deployment dry run. Vite's route
generator emits an existing circular-dependency warning; the build succeeds.

## Migration and persistence

- Applied migration 0002 with `npm run db:migrate:web` to the existing isolated
  database under `.wrangler/web-local`.
- Compared all six pre-existing time entries before and after migration: IDs,
  titles, and timestamps were unchanged.
- Repeated migration application: no pending migrations, no duplicate table.
- Applied both 0001 and 0002 to a fresh database under
  `.wrangler/todo-fresh-20261105`: both succeeded.
- Ran the local Worker on port 8792 with inspector port 9232 because an existing
  Vite process occupied 8791. Used the same `.wrangler/web-local` persistence path.
- Created todos, stopped and restarted the Worker, and confirmed that their
  content, statuses, and timestamps persisted.

## Manual HTTP observations

| Area | Observed result |
| --- | --- |
| Create/list | 201 with OPEN and server timestamps; default list includes every status in descending numeric ID order |
| Title preservation | Leading/trailing spaces and Chinese text round-trip unchanged; whitespace-only titles accepted |
| Update | Completing, reopening, title-only updates, and combined title/status updates return the complete todo |
| No-op update | Repeated identical title/status preserves updated_at; whitespace-only changes update it |
| Concurrent updates | Simultaneous title/status PATCH preserves both; same-field updates retain the last written value |
| Filter matches | OPEN/COMPLETED, Chinese contains, regex matches, AND/OR with parentheses, and timestamp comparison work |
| Empty/no matches | Missing, empty, and whitespace filters return all; a valid filter with no matches returns an empty list |
| Filter errors | Invalid Base64, padding, invalid UTF-8, oversized input, syntax errors, trailing tokens, unterminated quotes, unknown fields, type errors, and division by zero return INVALID_FILTER |
| Empty table | Malformed expressions fail during parsing; field access is handled by the evaluator only when an item is evaluated |
| Input errors | Empty/501-scalar titles, null, wrong types, lowercase/unknown statuses, empty PATCH, unknown fields, malformed JSON, and oversized bodies are rejected |
| Query errors | Repeated filter, status query parameter, and from/to are rejected with INVALID_FIELD |
| Routing | Invalid/overflow IDs fail with 400; unsupported methods return 405 with the correct Allow header; unknown paths return JSON 404 |
| Content-Type | Non-JSON write returns 415; API responses include Cache-Control: no-store |
| Delete | 204, then TODO_NOT_FOUND on repeated deletion and update; deleted items no longer appear |
| Entries regression | Creation, title trimming, range list, full replacement, zero-duration listing, deletion, missing-range error, and ENTRY_NOT_FOUND continue to work |
| Static assets | /calendar returns HTML with no-cache; the referenced application JS returns 200 |

The two verification todos and the temporary entry were deleted afterward.
The six original entries remain.

## Dependency update to 0.4.1

Both filter crates now come directly from crates.io at version 0.4.1. The
previous local 0.4.0 cache and parser patches and the entire vendor directory
have been removed. Upstream selects an LRU cache for wasm32-unknown-unknown.

The application no longer traverses the AST to validate field names. Unknown
fields return INVALID_FILTER only when accessed during evaluation. Empty lists
and short-circuited branches follow the evaluator's own behavior. Syntax and
encoding are still validated before loading items.

After this update, core check/Clippy, formatting, Wasm check, and the full local
build/dry run passed again. The Wasm dependency tree contains LRU, without Moka
or UUID. Manual Worker requests verified status/title filtering, regex matching,
rejection of trailing tokens and unterminated strings, and evaluation type errors.
An unknown field returns 200 with an empty table or a short-circuited branch,
and INVALID_FILTER when accessed on a real item. The temporary verification todo
was deleted afterward.

Remote rollout and a todo user interface remain separate work, as specified by
the implementation plan.

## Category backend — 2026-11-05

Implemented and verified only server changes. No automated test files were
added. No remote migration or deployment was performed. The frontend build was
not run; Wrangler read the existing `web/dist` assets for its dry run.

Final commands passed from `server/`:

```sh
cargo fmt --all -- --check
cargo check --workspace --locked
cargo clippy --workspace --locked --target wasm32-unknown-unknown -- -D warnings
npx wrangler deploy --config cloudflare-worker/wrangler.example.jsonc --dry-run
```

The dry run includes release Wasm compilation and wasm-opt. Runtime requests
used a local Worker on port 8794 (inspector 9234). Wrangler could not download
Request.cf metadata and used its local fallback; the Worker started and served
the requests successfully.

### Migration observations

- Applied all three migrations to isolated local D1 storage at
  `.wrangler/category-fresh-20261105`; the category list was initially empty.
  Applying migrations again reported no pending migrations.
- In `.wrangler/category-upgrade-20261105`, applied 0001, inserted historical
  entry ID 7 and deleted entry ID 99, then applied 0003. Entry 7 retained its
  title and timestamps and received category 1 (`Default`, `GRAY`). The stored
  entry sequence remained 99 and the next inserted entry received ID 100.
- In an in-memory SQLite database with foreign keys enabled, migrated an empty
  entries table whose last allocated ID was 123. No category was created by
  migration and the next entry received ID 124 after a category was added.
- `PRAGMA foreign_key_check` returned no violations on both local D1 databases.
  After concurrent HTTP writes, an explicit orphan-reference query returned zero.

### Manual HTTP observations

| Area | Observed result |
| --- | --- |
| Automatic category | A legacy create in an empty database creates `Default` / `GRAY`; the entry returns its string category_id |
| Default selection | With categories 3, 6, and 7, omission selects 3 even after category 3 was renamed |
| Empty reset and concurrency | After deleting all entries and categories, 12 concurrent legacy creates share exactly one newly created default category |
| Explicit category | Creating with an existing category succeeds; a missing category returns CATEGORY_NOT_FOUND and creates no entry or default category |
| Update compatibility | Explicit category changes succeed; an old-format update preserves the selected category; missing-category updates fail without changing title or category |
| Category management | Create, ascending list, combined edits, name-only and color-only edits work; omitted fields are preserved; duplicate names are allowed |
| Color enum | All eight uppercase enum values round-trip; lowercase and HEX colors return 400 |
| Invalid input | Blank name, empty PATCH, null fields, unknown fields, numeric category_id, zero and overflowing IDs return 400 |
| Reference protection | Deleting a referenced category returns 409 CATEGORY_IN_USE; after reassignment, deletion returns 204 and repeated deletion returns 404 |
| Concurrent deletion | Simultaneous category deletion and explicit create/update yielded deletion 204 and write CATEGORY_NOT_FOUND; no orphan references remained |
| Missing resources | Missing category PATCH returns CATEGORY_NOT_FOUND; missing entry PUT still returns ENTRY_NOT_FOUND |
| Routing | Unsupported category PUT returns 405 with Allow: PATCH, DELETE; category query parameters return 400 |
| Existing behavior | Entry trimming, range listing, zero-duration creation, deletion, and todo create/delete still work; API responses retain Cache-Control: no-store |

Source inspection confirmed that the existing Web parser ignores additional
entry fields and the mobile API accepts JSON without strict response-key
validation. Both clients omit category_id in their writes, which is covered by
the old-format HTTP requests above. No client files were changed by this work.
The isolated validation databases were retained for inspection; the local Worker
was stopped after verification.

Production rollout still requires a coordinated migration and deployment with
writes paused, as documented in README.md. Local verification does not establish
that a production migration has been applied.

## Production rollout (2026-11-05)

Todo and category migrations 0002/0003 were applied remotely after exporting D1 and temporarily pausing API access. The final Worker version is `47afe794-66d5-4ede-ac28-82a27fe39085`, serving application commit `11a77f7` with the integrated Web todo panel. No migrations remain pending.

Compared all 48 historical entries against the export: IDs, titles and timestamps were unchanged. Live todo create/complete/reopen/delete, category reads, and legacy entry create/update succeeded; the legacy update retained its category. Temporary verification records were deleted. This supersedes the local-only rollout status above.

## Todo descriptions — 2026-11-05 (plan 07)

Implemented the server portion only. No automated tests or test files were added.
Verification used manual HTTP requests, local D1, and the tracked example
configuration. No remote migration or deployment was performed for migration
0004; the production rollout recorded above covers only 0002/0003.

### Build and source checks

The following commands passed from `server/`:

```sh
cargo fmt --all -- --check
cargo check --workspace --locked
cargo clippy --workspace --locked -- -D warnings
cargo clippy --workspace --locked --target wasm32-unknown-unknown -- -D warnings
npm run build:local
```

The combined build passed frontend type checking, Vite compilation, release Wasm
compilation, wasm-opt, and Wrangler's deployment dry run. The existing route
generator circular-dependency warning remains. Existing, independently edited
Web sources were included in that build; no Web/mobile source changes were made
for this server implementation. `git diff --check` passed.

### Local migration and persistence

- Created an isolated legacy database at
  `.wrangler/description-upgrade-20261105` using migrations 0001–0003, then inserted
  historical todos 7 (OPEN, timestamps 100/120) and 9 (COMPLETED, 200/220).
- Applied `0004_add_todo_description.sql` with `wrangler d1 execute --local
  --file`. Both rows retained their IDs, titles, statuses, and timestamps and
  gained `description: ""`. The next HTTP-created todo received ID 10.
- Applied all four migrations to fresh storage at
  `.wrangler/description-fresh-20261105` with `wrangler d1 migrations apply
  --local`. Repeating that command reported no pending migrations.
- Started the Worker on port 8797 with inspector port 9237 and the upgrade
  database. After writes, stopped and restarted it with the same storage.
  Full list responses before and after restart were byte-identical (`cmp`).
- Local databases were retained for inspection. Wrangler used fallback
  Request.cf metadata after a download timeout; local API requests succeeded.

Both storage commands used
`--config cloudflare-worker/wrangler.example.jsonc` and an explicit
`--persist-to` path. No existing development database was migrated by this work.

### Manual HTTP observations

| Area | Observed result |
| --- | --- |
| Legacy create | A title-only POST returned 201 with an empty description and OPEN status |
| Description lifecycle | Created and read descriptions, edited notes while OPEN and COMPLETED, cleared with an empty string, and reopened without losing content |
| Partial updates | Title-only and status-only PATCH preserved notes; description-only PATCH preserved title, status, and created_at, including after restart |
| Atomic update | Status plus description saved together; a request containing an invalid title changed neither status nor description |
| Timestamps | An identical description submitted in a later second retained updated_at; a changed description advanced it while preserving created_at |
| Unicode and plain text | Chinese, emoji, leading/trailing spaces, newlines, tabs, embedded NUL, and literal HTML survived storage and list retrieval |
| Scalar limit | 10,000 scalars succeeded; 10,001 failed with a description field violation on POST and PATCH |
| Large JSON | A 10,000-character Chinese/emoji note exceeded the old 16 KiB limit and succeeded; 10,000 escaped emoji plus a 500-emoji title also succeeded |
| Body limit | A valid JSON body padded to exactly 131072 bytes succeeded; 131073 bytes failed. Oversized POST and PATCH returned the 131072-byte error |
| Other APIs | Oversized entries and categories requests still returned the 16384-byte error |
| Invalid inputs | Null, numeric, boolean and array descriptions, unknown fields, and empty PATCH were rejected; POST continued rejecting client-supplied status |
| Filtering | A Base64-encoded `description.contains('Verified')` expression returned the matching completed todo with its full description |
| Missing resource | Description PATCH to missing ID 99999 returned 404 TODO_NOT_FOUND |

Source inspection of `web/src/api/todos.ts` and `mobile/src/api/todos.ts`
confirmed that their existing response parsers ignore extra fields and their
create/update requests omit description. The legacy-shaped requests above
verified preservation on the new backend. This is not an end-to-end UI or
mobile-device validation; description editing belongs to the separate Web plan.

### List-size observation and rollout

Added 100 synthetic todos with 1,000 Chinese characters each to the isolated
upgrade database. With the other eight migration/boundary records (including
three maximum-length notes), GET returned all 108 items: 422,908 bytes in one
local curl observation of 0.008361 seconds. This is a local size/behavior check,
not a production latency benchmark. Lists still load full descriptions and
filter in memory; large datasets may need pagination or a separate detail API.

Production release order remains migration 0004, new server, then a Web editor
using the new contract. The server deployment command bundles the current Web
checkout. Rollbacks must retain the new column/data and use matching server/Web
versions, as documented in README.md. The local Worker was stopped after checks.

## Time-entry descriptions — 2026-11-06 (plan 02)

Implemented server changes only: migration 0005, core model/validation, D1
storage, HTTP input/output, and API documentation. No Web/mobile source changes,
automated tests, or test files were added. Verification used one-off local HTTP
requests and isolated local D1 databases; no remote migration or deployment was
performed.

### Build checks

These commands passed from `server/`:

```sh
cargo fmt --all -- --check
cargo check --workspace --locked
cargo clippy --workspace --locked -- -D warnings
cargo clippy --workspace --locked --target wasm32-unknown-unknown -- -D warnings
npm run build:local
```

The combined build passed Web type checking, Vite compilation, release Wasm
compilation, wasm-opt, and Wrangler deployment dry run. The existing route
generator circular-dependency warning remains. `git diff --check` passed.

### Migration and persistence

- Created `.wrangler/entry-description-upgrade-20261106` with migrations
  0001–0004, historical category 7, and entry 41 (title `Historical entry`,
  timestamps 100/200, category 7). Applied 0005 with local `d1 execute --file`.
  The entry retained all original values and gained an empty description.
- Applied all five migrations to
  `.wrangler/entry-description-fresh-20261106` with local `d1 migrations apply`.
  Repeating the command reported no pending migrations.
- A legacy SQL INSERT omitting description succeeded after migration and
  returned entry 49 with an empty description. `PRAGMA foreign_key_check`
  returned no violations before and after runtime verification.
- The first HTTP insert in the upgrade database received ID 42. On the fresh
  database, a legacy POST created category 1 (`Default`, `GRAY`) and entry 1
  with an empty description.
- Stopped and restarted the upgrade Worker after writes. The complete list of
  seven entries, including maximum-length descriptions, matched the saved JSON
  snapshot exactly after restart.

All Wrangler operations used the tracked
`cloudflare-worker/wrangler.example.jsonc`, `--local`, and explicit
`--persist-to` paths. Runtime ports were 8802/9242 (upgrade HTTP/inspector) and
8803/9243 (fresh). Both Worker processes were stopped after verification. Local
databases and the persistence snapshot remain under ignored `.wrangler/` paths.

### Manual HTTP observations

| Area | Observed result |
| --- | --- |
| Legacy create | POST without description returned 201, trimmed title, assigned category, and empty description |
| Description lifecycle | PUT replaced, cleared, and preserved whitespace-only descriptions; changing only description succeeded |
| Old-client update | PUT changing title/time or category without description preserved the stored note |
| Plain text | Chinese, emoji, leading/trailing spaces, tabs, line breaks, and literal HTML-like content round-tripped unchanged |
| Scalar boundary | POST and PUT accepted 10,000 emoji; 10,001 returned 400 with a description field violation |
| Large JSON | POST and PUT accepted 30,082-byte Chinese UTF-8 bodies, 42,068-byte raw emoji bodies, and 126,068-byte escaped emoji bodies containing a 500-emoji title and 10,000-emoji description |
| Body boundary | Entry POST and PUT accepted exactly 131072 bytes and rejected 131073 with the body-size error |
| Input rejection | Both POST and PUT rejected null, number, boolean, array, object descriptions, and unknown fields with 400; type errors identified body |
| Required fields | Description-only PUT remained invalid; title and both timestamps are still required |
| Existing errors | Invalid time range returned INVALID_TIME_RANGE; missing category returned CATEGORY_NOT_FOUND; missing entry returned ENTRY_NOT_FOUND |
| Atomic failure | An invalid-category PUT containing a new description left the entire existing entry unchanged |
| Concurrent compatibility | Simultaneous new-description PUT and old-format PUT both returned 200; the new description remained stored |
| Listing | All records included string descriptions; historical rows returned empty strings; ordering remained start time then numeric ID |
| Range boundaries | A spanning record and point at from were included; records ending at from, starting at to, and points at to were excluded |
| Delete | DELETE returned 204 without a body, followed by 404 on repeated deletion |
| Todo regression | 10,000-emoji description accepted, status-only PATCH preserved it, 10,001 rejected; body boundary remained 131072/131073 bytes |
| Category regression | Body boundary remained 16384/16385 bytes |

Source inspection of `web/src/api/entries.ts` and
`mobile/src/api/entries.ts` confirmed that both response parsers explicitly
select known fields, ignore additional description fields, and omit description
in writes. The legacy-shaped HTTP requests above cover that contract. This was
not a browser/mobile UI validation; the Web editor belongs to plan 03.

### Rollout status

Migration 0005 has only been applied to isolated local databases. Release order
is migration, new server, then the Web description editor. Retain the column and
its data during rollback and use matching server/Web versions. The README
documents these steps and the fact that server deployment bundles Web assets.
The earlier statement that entries use a 16 KiB body limit is superseded by
this change; categories still use 16 KiB.

## Daily todo effort — 2026-11-11

Implemented migration 0007 and the existing Todo API extensions, shared client parsing, Web modal autosave, and mobile explicit-save editing. Validation used local D1 and Wrangler on port 8791; the Web development proxy pointed to that local server. No production deployment or migration was performed. No test files were added.

- Rust formatting and workspace Clippy with warnings denied passed. Web lint, type checking and production build passed. Mobile type checking, lint, and iOS/Android exports passed. The local Worker build passed.
- Manual HTTP checks covered defaults; 240 historical + 20 today = 260; replacing today with 35 = 275; repeated writes without accumulation; clearing the expectation; date, type, range and unknown-field rejection; atomic rejection of a combined invalid patch; existing filters; completion/reopening; and deletion without orphan effort records. Repeating an unchanged patch after more than one second preserved updated_at.
- Runtime Web store checks exercised a prior-day draft followed by a new-day list, a lost response after a successful write, edits made while a request was pending, reverting a pending value, and uncertain prior-day recovery. The original date stayed bound to the draft, newer input survived responses, and uncertain writes required explicit reconciliation. These were manual runtime scenarios, not committed automated tests.
- Chromium desktop and 320px touch emulation covered summary-to-input focus, autosave, clearing an expectation, total previews, invalid minutes preventing Done from closing, menu focus, safe default focus in deletion confirmation, Escape returning to the menu trigger, and Done restoring the originating summary button. The open modal had no horizontal overflow at 320px.
- Native mobile interaction and physical-device accessibility were not verified; mobile evidence is limited to static checks and exports. Production rollout remains migration, compatible API, then clients, with APP_TIME_ZONE configured.

# Tickmark server

A Rust workspace for completed time entries, categories, and todos. `core` owns validation, business operations, in-memory todo filtering, and the asynchronous repository traits. `cloudflare-worker` implements HTTP and D1 persistence. Core has no platform dependencies.

## Local development

Requirements: rustup, Node.js 22.12 or newer, and npm. Run every command below from `server/`. No Cloudflare account is needed locally.

```sh
rustup show
cargo install worker-build --version 0.8.7 --locked
npm ci
npm --prefix ../web ci
npm run build:web
cp -n cloudflare-worker/wrangler.example.jsonc cloudflare-worker/wrangler.jsonc
npm run db:migrate
npm run dev
```

`rust-toolchain.toml` selects Rust 1.97.1, rustfmt, Clippy, and the `wasm32-unknown-unknown` target. Wrangler is pinned in `package-lock.json`. `worker-build` must be on PATH; its version is pinned in the installation command above. The first build downloads its Wasm build tools.

The API runs at `http://localhost:8787`. Local D1 data persists under `cloudflare-worker/.wrangler/state/` across restarts. The tracked `wrangler.example.jsonc` contains a placeholder database ID suitable for local development. Copy it to the ignored `wrangler.jsonc` once; keep deployment-specific account and database IDs in that local file. The copy command preserves any existing configuration. Local commands always use isolated local storage. There is no authentication or token configuration in this version.

## Web client

The React frontend is built from `../web` and uploaded with the Worker. The example configuration binds `../../web/dist` as `ASSETS`. Existing installations must merge the example's `assets` configuration into their ignored `wrangler.jsonc` while preserving account, database, and domain settings.

`/api` and `/api/*` always run the Rust API handler. Page navigation falls back to `index.html` through the asset binding; missing scripts remain 404. HTML uses `no-cache`, hashed assets use immutable caching, and API responses use `no-store`. Both frontend assets and Wasm belong to one deployment and should be rolled back together.

For an isolated local web environment using the tracked example config:

```sh
npm run db:migrate:web
npm run dev:web
```

Open http://localhost:8791. This workflow stores local D1 data under `.wrangler/web-local`. For frontend hot reload, run `TICKMARK_DEV_API=http://127.0.0.1:8791 npm --prefix ../web run dev` in another terminal; the override targets the isolated Worker on port 8791. Without that override, the web development server proxies to `https://tickmark.peterlits.me`. Restart Wrangler after rebuilding static assets so its local manifest includes the new hashed files.

`npm run build:local` performs the combined frontend and Worker dry run with the tracked example config. See [the web README](../web/README.md) for full usage and [validation notes](../web/VALIDATION.md) for verification coverage.

## Time entries API

| Method | Path | Result |
| --- | --- | --- |
| POST | `/api/v1/entries` | 201 with the created entry |
| GET | `/api/v1/entries?from=...&to=...` | 200 with `{ "items": [...] }` |
| PUT | `/api/v1/entries/:id` | 200 with the updated entry |
| DELETE | `/api/v1/entries/:id` | 204 without a body |

An entry contains `id` and `category_id` (decimal strings), `title`, `description`, `start_time`, and `end_time`. Both timestamps are required integer UNIX seconds in `0..=9007199254740991`. End must be at least start. Titles are trimmed and must contain 1–500 Unicode scalar values. Overlapping and zero-duration entries are allowed. POST and PUT require `title`, `start_time`, and `end_time`, accept optional `category_id` and `description`, and reject unknown fields; PUT never creates missing entries. Entry JSON request bodies are limited to 128 KiB (131072 bytes). Writes are last-write-wins and deletes are permanent.

`category_id`, when provided, must be a decimal string representing a positive
signed 64-bit integer and must reference an existing category. Explicit null,
numeric JSON values, malformed IDs, and out-of-range IDs are rejected. POST
without `category_id` uses the category with the smallest numeric ID. If none
exists, it atomically creates `Default` with color `GRAY` and uses it. This also
works after all unused categories have been deleted. PUT without `category_id`
preserves the entry's existing category; providing it changes the category.
A nonexistent category returns `404 / CATEGORY_NOT_FOUND` without changing data.

`description` is plain text with at most 10,000 Unicode scalar values. It is
always a string in create, replace, and list responses, including `""` for
historical entries. Leading/trailing whitespace, newlines, and HTML-like text
are preserved without trimming or markup processing.

| Request description | POST | PUT |
| --- | --- | --- |
| Omitted | Store an empty string | Preserve the current stored description |
| Empty string | Store an empty string | Clear the description |
| Nonempty string | Store verbatim after validation | Replace verbatim after validation |
| Null or non-string | 400 INVALID_FIELD (body) | 400 INVALID_FIELD (body) |
| More than 10,000 scalars | 400 INVALID_FIELD (description) | 400 INVALID_FIELD (description) |

PUT still requires title and both timestamps; description-only PUT is not
supported. Omitted descriptions are preserved atomically in the UPDATE, so old
clients can change title, time, or category without clearing newer notes.
The JSON byte limit is separate from the Unicode scalar limit and is enforced
while reading the request stream. Categories retain their 16 KiB body limit;
todos retain their 128 KiB limit.

Example POST or full PUT body:

```json
{
  "title": "Planning",
  "description": "Review priorities.\nRecord follow-up actions.",
  "start_time": 1793754000,
  "end_time": 1793757600,
  "category_id": "1"
}
```

The successful response includes the assigned `id`:

```json
{
  "id": "42",
  "category_id": "1",
  "title": "Planning",
  "description": "Review priorities.\nRecord follow-up actions.",
  "start_time": 1793754000,
  "end_time": 1793757600
}
```

To clear notes, send a full PUT with `"description": ""`. To preserve them,
omit that field, as the legacy curl examples below do.

The list requires both `from` and `to`, with `from < to`. The range is `[from, to)`. Entries match when `start_time < to AND end_time > from`; zero-duration entries match when their timestamp is at least from and below to. Results retain original timestamps and are ordered by start time, then numeric ID, ascending. All matches are returned without pagination or silent truncation. Missing, duplicate, unknown, or invalid query parameters are rejected.

To show today, the client computes midnight and the next midnight in the user's timezone, then converts both to UNIX seconds. Do not assume every local day lasts 86400 seconds. Cross-midnight entries appear in every intersecting day; duration summaries should count only the overlap with the requested range.

### Manual walkthrough

The following example uses November 4, 2026 in Asia/Shanghai, from `1793721600` to `1793808000`.

```sh
curl -i http://localhost:8787/api/v1/entries \
  -H 'Content-Type: application/json' \
  -d '{"title":" Planning ","start_time":1793754000,"end_time":1793757600}'

curl -i 'http://localhost:8787/api/v1/entries?from=1793721600&to=1793808000'
```

Copy the returned ID into `entry_id`:

```sh
entry_id=1
curl -i -X PUT "http://localhost:8787/api/v1/entries/$entry_id" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Project planning","start_time":1793754000,"end_time":1793759400}'

curl -i 'http://localhost:8787/api/v1/entries?from=1793721600&to=1793808000'
```

Stop and restart `npm run dev`; repeat the list request to confirm persistence. Then delete:

```sh
curl -i -X DELETE "http://localhost:8787/api/v1/entries/$entry_id"
curl -i 'http://localhost:8787/api/v1/entries?from=1793721600&to=1793808000'
curl -i -X DELETE "http://localhost:8787/api/v1/entries/$entry_id"
curl -i http://localhost:8787/api/v1/entries
```

The second delete returns 404; the list without a time range returns 400. To inspect boundary behavior manually, create entries ending exactly at from, starting exactly at to, spanning from, and zero-duration entries at each boundary. Only the spanning entry and the point at from should match.

### Errors

Errors follow the [AIP-193 HTTP JSON structure](https://google.aip.dev/193#http11json-representation), without gRPC or protobuf dependencies:

```json
{
  "error": {
    "code": 404,
    "status": "NOT_FOUND",
    "message": "The requested entry does not exist.",
    "details": [{
      "@type": "type.googleapis.com/google.rpc.ErrorInfo",
      "reason": "ENTRY_NOT_FOUND",
      "domain": "tickmark.peterlitszo",
      "metadata": {}
    }]
  }
}
```

`code` is the HTTP status, not the numeric gRPC code. Every error includes `ErrorInfo`; clients should use its stable domain/reason rather than parsing the English message. Field errors also include `google.rpc.BadRequest.fieldViolations`. Internal failures are logged server-side and not exposed in responses.

| HTTP | status | reason |
| --- | --- | --- |
| 400 | INVALID_ARGUMENT | INVALID_JSON, INVALID_FIELD, INVALID_TIME_RANGE, INVALID_FILTER |
| 404 | NOT_FOUND | ENTRY_NOT_FOUND, TODO_NOT_FOUND, CATEGORY_NOT_FOUND, ROUTE_NOT_FOUND |
| 409 | FAILED_PRECONDITION | CATEGORY_IN_USE |
| 405 | UNIMPLEMENTED | METHOD_NOT_ALLOWED |
| 415 | INVALID_ARGUMENT | UNSUPPORTED_MEDIA_TYPE |
| 500 | INTERNAL | INTERNAL_ERROR |

405 includes an Allow header. The 405 and 415 mappings preserve this API's HTTP semantics rather than strictly adopting Google's RPC-to-HTTP mapping. The browser client uses relative API URLs and is served from the same origin through Worker Static Assets. Local Vite development proxies `/api` to the Worker; CORS is not required.

## Categories API

Each time entry belongs to exactly one category. Categories are shared by all
clients, and these routes use the same unauthenticated access as entries.

| Method | Path | Result |
| --- | --- | --- |
| POST | `/api/v1/categories` | 201 with the created category; requires `name` and `color` |
| GET | `/api/v1/categories` | 200 with `{ "items": [...] }`, ordered by numeric ID ascending |
| PATCH | `/api/v1/categories/:id` | 200 with the updated category; provide `name` and/or `color` |
| DELETE | `/api/v1/categories/:id` | 204 if unused; 409 if referenced by any time entry |

A category looks like `{"id":"1","name":"Work","color":"BLUE"}`. IDs are
positive signed 64-bit integers encoded as decimal strings. Names are trimmed
and must contain 1–100 Unicode scalar values. Duplicate names are allowed.

`color` is a case-sensitive semantic enum: `RED`, `ORANGE`, `YELLOW`, `GREEN`,
`BLUE`, `PURPLE`, `PINK`, or `GRAY`. The server stores and returns only that enum;
each frontend chooses actual display colors, including theme-specific values.
HEX/RGB values and unknown or lowercase enum values are rejected. Automatically
created categories use the literal name `Default` and color `GRAY`; there is no
localization. They can be renamed, recolored, or deleted when unused.

PATCH preserves omitted fields and requires at least one field. Both writes
reject nulls, unknown fields, and incorrect types. GET accepts no query
parameters and returns all categories without pagination. Updating or deleting
a nonexistent category returns `404 / CATEGORY_NOT_FOUND`. Deleting a referenced
category returns `409 / CATEGORY_IN_USE`; entries are never deleted or reassigned
as a side effect. Foreign keys protect references during concurrent writes.
Existing body limits, Content-Type rules, and error envelopes apply.

```sh
curl -i http://localhost:8787/api/v1/categories \
  -H 'Content-Type: application/json' \
  -d '{"name":"Work","color":"BLUE"}'
curl -i http://localhost:8787/api/v1/categories
```

Use the returned ID as `category_id` when creating an entry. The following
example assumes that the returned ID was `1`:

```sh
curl -i http://localhost:8787/api/v1/entries \
  -H 'Content-Type: application/json' \
  -d '{"title":"Planning","start_time":1793754000,"end_time":1793757600,"category_id":"1"}'
curl -i -X PATCH http://localhost:8787/api/v1/categories/1 \
  -H 'Content-Type: application/json' \
  -d '{"name":"Study","color":"GREEN"}'
curl -i -X DELETE http://localhost:8787/api/v1/categories/1
```

The final request returns 409 while the entry references that category.

### Category migration and rollout

Migration `0003_create_categories.sql` creates categories and assigns existing
entries to `Default` / `GRAY`, preserving their IDs, titles, timestamps, and the
entry ID allocation high-water mark. An empty database remains without categories
until a client creates one or an entry needs the automatic default. The migration
rebuilds the entries table with a non-null category foreign key and an index.

Before production rollout, record a D1 recovery point or backup, pause writes,
apply pending migrations, deploy the new Worker, verify entry/category reads and
writes, then resume writes. An old Worker cannot insert entries after this
migration because it does not supply the new required column. Rolling back only
the Worker is therefore unsafe; database recovery and Worker rollback must be
coordinated while writes remain paused. These changes are not a zero-downtime
migration. Local validation does not apply remote migrations or deploy releases.

## Todos API

Todos are independent of time entries. Completing one never creates a time entry.
All routes remain unauthenticated, just like the existing entries API.

| Method | Path | Result |
| --- | --- | --- |
| POST | `/api/v1/todos` | 201 with a new OPEN todo; body requires `title`, accepts optional `description` |
| GET | `/api/v1/todos` | 200 with `{ "items": [...] }`, including all statuses |
| GET | `/api/v1/todos?filter=...` | 200 with matching items, filtered in memory |
| PATCH | `/api/v1/todos/:id` | 200 with the updated todo; provide at least one editable field |
| DELETE | `/api/v1/todos/:id` | 204 without a body; deletion is permanent |

A todo contains `id` (a decimal string), `title`, `description`, `status` (`OPEN` or `COMPLETED`),
`created_at`, and `updated_at`. Timestamps are server-generated integer UNIX
seconds. Creation sets both timestamps and defaults status to OPEN. There is no
completion timestamp. All list results are ordered by numeric ID descending.
There is no pagination or silent truncation; open items persist across days.

Titles contain 1–500 Unicode scalar values. **Titles are preserved exactly**:
no trimming or normalization, and whitespace-only titles are accepted. Empty
strings are rejected. This differs from the existing entries title rules.

Descriptions contain 0–10,000 Unicode scalar values and preserve whitespace,
newlines, and Unicode exactly. Responses always include a string description.
Omitting it during creation defaults to `""`; setting it to `""` during PATCH
clears it. Both OPEN and COMPLETED todos allow editing descriptions. Completing
or reopening a todo preserves its description. This is one editable plain-text
note, without comment history, authors, attachments, or HTML rendering.

PATCH is partial: omitted fields stay unchanged. Only `expected_daily_minutes`
accepts explicit null; an empty object, unknown fields, and invalid types are rejected. Status values are case
sensitive. Set `{"status":"COMPLETED"}` to complete or `{"status":"OPEN"}` to
reopen. Repeating identical values preserves `updated_at`; changing whitespace
counts as an edit. Multiple edits in the same second can share a timestamp, so
`updated_at` is not a version token. Title, status, and description updates are atomic, and
concurrent edits to different fields do not overwrite each other. Concurrent
edits to the same field are last-write-wins.

POST rejects client-supplied IDs, timestamps, or status. Duplicate titles are
allowed; POST has no retry deduplication. IDs must be positive integers in the
signed 64-bit range. Updating or deleting a missing todo returns 404 with
`TODO_NOT_FOUND`; repeated deletion also returns 404. Todo POST/PATCH JSON bodies
are limited to 128 KiB (131072 bytes), checked while streaming, independently of
the scalar limit. Entries and categories retain their 16 KiB limit. Existing
Content-Type handling, error envelopes, and `Cache-Control: no-store` apply.

### Daily effort

Todo responses also contain `expected_daily_minutes` (null or 1–1440),
`today_spent_minutes` (0–1440), and `total_spent_minutes` (read-only sum including
today). Lists return top-level `today` (`YYYY-MM-DD`) and `time_zone`; POST/PATCH
return these metadata fields on the flat Todo object. GET still accepts only
`filter`, with no date parameter. The service resolves the current day once per
request using the required IANA `APP_TIME_ZONE` variable (default configuration:
`Asia/Shanghai`). A missing or invalid configuration fails explicitly.

PATCH accepts `expected_daily_minutes` and `daily_effort` alongside existing
fields. Clear the expectation with null. Set the absolute total for a date with
`{"daily_effort":{"date":"2026-11-11","minutes":35}}`; it is never an increment.
The date must be a real Gregorian date in 0001–9999; minutes must be an integer
from 0 to 1440. Both nested fields are required and unknown nested fields are
rejected. Zero clears that day's minutes. Direct writes to either summary field
are rejected. The date binds a draft to its original day across midnight; the
clients offer no history picker. A response to an older-day update still reports
the server's current day and a total including the older-day change.

Ordinary fields, expectation, daily UPSERT, and the resulting aggregate snapshot
share one D1 batch transaction. Repeating the same values preserves `updated_at`.
There is no CAS/version token: concurrent writes to the same field or day's total
use the last committed value. Completion and reopening retain all time records;
deletion cascades to the daily table. No time entries are created or linked.

Apply migration `0007_add_todo_effort.sql` before deploying the API and clients.
Merge `vars.APP_TIME_ZONE` from the example into existing deployment config.
Keep the new column/table during an application rollback. An older server can
continue ordinary todo operations; clients show time tracking as unavailable
when its response omits the new fields. Changing the configured time zone is
not a user setting and requires a separate historical-data migration decision.

Web uses its existing five-second draft queue, flushes on blur/close, and keeps
invalid or uncertain changes for recovery. Mobile retains its existing explicit
Save/Cancel editor. Both submit only changed fields and bind daily edits to the
server-provided date. Clients refresh on foreground/focus and day rollover;
stale summaries keep their date rather than displaying a fabricated zero.

Examples of request bodies:

```json
{"title":"Review release","description":"Check the migration steps."}
```

After completion, PATCH only the description to leave status and title unchanged:

```json
{"description":"Completed. Follow up on the documentation."}
```

Complete and save a note atomically, or clear the note in a subsequent PATCH:

```json
{"status":"COMPLETED","description":"Verified the release."}
```

```json
{"description":""}
```

### Filtering

`filter` is an optional UTF-8 expression encoded as **URL-safe Base64 without
padding** (`-` and `_`, no trailing `=`). Do not encode a JSON object. Only the
`filter` query parameter is supported; the old proposed `status` query parameter
is not implemented. Omitted, empty, or decoded whitespace-only filters return all
items. Unknown or repeated query parameters return `INVALID_FIELD`.

The expression context exposes string fields `id`, `title`, `description`, `status`, and i64
fields `created_at`, `updated_at`. For example, before encoding:

```text
status = 'OPEN'
status = 'COMPLETED'
status = 'OPEN' AND title.contains('计划')
description.contains('Verified')
created_at >= 1793808000 AND (status = 'OPEN' OR title.starts_with('Review'))
id = '12'
matches(title, '^Review')
```

Expressions use the syntax and built-ins from `filter-expr` and
`filter-expr-evaler` **0.6.0**, directly from crates.io.
Strings are case sensitive: `status = 'open'` matches nothing. A string method
such as `title.trim()` affects only that expression's result, never stored data.

The Worker decodes the parameter, then core parses once, loads all todos in ID order,
and evaluates each item with a request-local evaluator. No filter text is sent to SQL, and no custom I/O functions are
registered. Time and memory usage grow with the full table size.

The encoded value is limited to 5462 ASCII characters, and decoded text to 4096
UTF-8 bytes. Invalid encoding, invalid UTF-8, syntax errors, unknown fields, and
per-item evaluation errors return 400 with `INVALID_FILTER` and a field violation
for `filter`. Evaluation must produce a boolean. Errors do not become false
matches or partial result lists. Empty tables still validate encoding and syntax,
but do not run per-item evaluation. Unknown fields fail only if evaluation
accesses them; short-circuited branches are not evaluated.

The upstream evaluator uses its Wasm-compatible cache on Workers. No vendored
crates, Cargo patches, or application-level AST traversal are required.

### Manual todo walkthrough

Build and migrate the isolated local environment from `server/`:

```sh
npm run build:local
npm run db:migrate:web
npm run dev:web
```

If port 8791 is in use, start the same local database on another port instead:

```sh
npx wrangler dev --config cloudflare-worker/wrangler.example.jsonc --local \
  --port 8792 --inspector-port 9232 --persist-to .wrangler/web-local
```

Set the URL to the port actually used, then create an item:

```sh
api_url=http://localhost:8791
curl -i "$api_url/api/v1/todos" -H 'Content-Type: application/json' \
  -d '{"title":"  Review the weekly plan  "}'
curl -i "$api_url/api/v1/todos"
```

Copy its returned ID into `todo_id`. Complete, filter, and reopen it:

```sh
todo_id=1
curl -i -X PATCH "$api_url/api/v1/todos/$todo_id" \
  -H 'Content-Type: application/json' -d '{"status":"COMPLETED"}'

filter_value=$(python3 -c "import base64; print(base64.urlsafe_b64encode(b\"status = 'COMPLETED'\").decode().rstrip('='))")
curl -i --get "$api_url/api/v1/todos" --data-urlencode "filter=$filter_value"

curl -i -X PATCH "$api_url/api/v1/todos/$todo_id" \
  -H 'Content-Type: application/json' -d '{"status":"OPEN"}'
curl -i -X PATCH "$api_url/api/v1/todos/$todo_id" \
  -H 'Content-Type: application/json' -d '{"title":"Review next week"}'
```

Repeat an identical PATCH to confirm `updated_at` is unchanged. Stop and restart
Wrangler with the same storage directory, then list again to confirm persistence.
Delete the item and verify repeated deletion returns 404:

```sh
curl -i -X DELETE "$api_url/api/v1/todos/$todo_id"
curl -i -X DELETE "$api_url/api/v1/todos/$todo_id"
curl -i -X PATCH "$api_url/api/v1/todos/$todo_id" \
  -H 'Content-Type: application/json' -d '{"status":null}'
curl -i "$api_url/api/v1/todos?filter=invalid!"
```

## Build checks

No automated tests or test scripts are added.
See [the todo validation record](VALIDATION.md) for build, migration, and manual HTTP results.

```sh
cargo fmt --all -- --check
cargo check -p tickmark-core --locked
cargo clippy -p tickmark-core --locked -- -D warnings
cargo check -p tickmark-cloudflare-worker --target wasm32-unknown-unknown --locked
npm run build
```

`npm run build` first builds `../web/dist`, then compiles Wasm, generates the JavaScript entrypoint, and performs a Wrangler deployment dry run. It does not deploy or create remote resources. The build runs in the Worker crate because the workspace root is a virtual Cargo manifest. Rust accesses bindings through the SDK, so TypeScript Env generation and Node.js compatibility flags are unnecessary here.

## Remote deployment

API base URL: https://tickmark-server.peterlitszo.workers.dev/api/v1/entries

If your local `wrangler.jsonc` already binds the deployed `tickmark` database, authenticate with `npx wrangler login`, then use the migration and deployment commands below. A fresh checkout only contains the template; configure the target account and database before deploying.

For a separate account or installation, create a new database:

```sh
npx wrangler login
npx wrangler d1 create tickmark
```

In `cloudflare-worker/wrangler.jsonc`, set `account_id` to the target account ID and `database_id` to the database ID returned by Cloudflare. Keep the binding name `DB`. Then apply all pending migrations before deploying the Worker:

```sh
npx wrangler d1 migrations apply DB --config cloudflare-worker/wrangler.jsonc --remote
npm run deploy
```

The deployed API has the same unauthenticated behavior as the local API. No remote resources are required to build or verify this repository.

Migration `0002_create_todos.sql` adds a table without changing `time_entries`.
Before a production release, verify the target configuration and record the
current Worker version and database recovery information. If migration fails,
do not deploy. After deployment, manually check todo creation, completion,
reopening, deletion, and existing entries. For an application rollback, restore
the previous Worker and matching assets while retaining the new table and its
data; do not drop todos or restore an old database as a routine app rollback.


### Todo description rollout

Migration `0004_add_todo_description.sql` adds a non-null description column with
an empty-string default. Existing todo IDs, titles, statuses, and timestamps are
unchanged. Apply the migration before deploying the new server; release any Web
client that writes descriptions only after that server is available. Old Web and
mobile clients can continue creating title-only todos and patching title/status
without clearing notes. Their existing response parsers ignore extra fields.

`npm run deploy` builds and bundles the current Web checkout, so verify the
frontend revision before releasing. For an application rollback, restore the
matching server and Web versions while retaining the description column and its
data. An older server rejects description writes; do not leave a new description
editor connected to it. Do not drop the column or restore the whole database as
part of an ordinary application rollback.

Lists still return all todos with full descriptions. Response size and filtering
cost grow with the number and length of notes; pagination and a separate detail
endpoint are outside this change.

### Time-entry description rollout

Apply `0005_add_time_entry_description.sql` before deploying this server, then
release the Web description editor. The additive migration retains existing
entries, category references, indexes, and IDs; old INSERT statements can omit
the new column and receive its empty-string default. Existing Web/mobile entry
parsers ignore the extra response field and their old-format PUT requests
preserve descriptions.

The deployment command bundles the current Web checkout. Keep the old frontend
for a server-first release if the new editor is not ready. Roll back the Web
client first; if reverting the server, also use matching older Web assets.
Retain the description column and its data. An older server rejects writes
containing description, but can still write the original columns. Do not drop
the column or restore an old database during an ordinary application rollback.

Entry lists include full descriptions for all matching records. Pagination and
a separate detail endpoint are outside this change. See [validation](VALIDATION.md)
for local-only verification; this document does not establish remote rollout.


## Saved todo filters

The Web and mobile clients share named filter tabs stored in D1. Apply migration
`0006_create_todo_filters.sql` before using this feature. The built-in All tab is
not stored. Each client remembers only its selected tab locally.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/v1/todo-filters` | `{ "items": [...] }`, ordered by position then ID |
| POST | `/api/v1/todo-filters` | Create with `name` and `filter_expr`; 201 |
| PATCH | `/api/v1/todo-filters/:id` | Update `name` and/or `filter_expr`; 200 |
| DELETE | `/api/v1/todo-filters/:id` | Delete the configuration only; 204 |

Responses contain `id` (decimal string), `name`, `filter_expr`, `position`,
`created_at` and `updated_at`. Names are trimmed and accept 1–60 Unicode scalar
values; duplicate names are allowed. Expressions are nonempty and limited to
4096 UTF-8 bytes. Store and submit the original expression in JSON; Base64 is
used only for the existing `/todos?filter=...` query protocol. Position is
allocated in the insert statement and is not client-editable. Unknown fields,
explicit nulls and query parameters are rejected. A missing configuration
returns `TODO_FILTER_NOT_FOUND`. Expression errors identify `filter_expr`.

Saving parses the expression and evaluates existing todos. An empty database
cannot exercise per-item errors, and short-circuited branches or future data can
still expose errors later. Query errors remain visible, with an editing path.
Configuration edits use last-write-wins semantics. Requests with uncertain
outcomes should be checked against the refreshed list before retrying.

Both filter crates are pinned to 0.5.0. Each request compiles its expression once
and reuses the compiled handle for all todos. The evaluator's `js` feature
supports its time functions on Worker WASM. Existing timestamp fields remain
integer Unix seconds. No expressions are interpolated into SQL.

The clients refresh configurations on focus/reconnect and manual refresh.
Filtered query caches are separate from the complete todo list used for draft
recovery. Saving a todo refreshes matching results; unfinished edits stay
accessible. Creating an unmatched todo provides a View todo action.

The in-app Expression help contains examples, field types, syntax and
troubleshooting. Its data-only content lives in `shared/todoFilters.ts` and is
bundled into both clients, so reading help does not require a network request.
The mobile bundle includes expo-clipboard; existing development clients need a
new native build if they do not already include that module.

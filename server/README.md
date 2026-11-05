# Tickmark server

A Rust workspace for completed time entries and todos. `core` owns validation, business operations, in-memory todo filtering, and the asynchronous repository traits. `cloudflare-worker` implements HTTP and D1 persistence. Core has no platform dependencies.

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
| PUT | `/api/v1/entries/:id` | 200 with the fully replaced entry |
| DELETE | `/api/v1/entries/:id` | 204 without a body |

An entry contains `id` (a decimal string), `title`, `start_time`, and `end_time`. Both timestamps are required integer UNIX seconds in `0..=9007199254740991`. End must be at least start. Titles are trimmed and must contain 1–500 Unicode scalar values. Overlapping and zero-duration entries are allowed. POST and PUT require all three editable fields and reject unknown fields; PUT never creates missing entries. JSON request bodies are limited to 16 KiB. Writes are last-write-wins and deletes are permanent.

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
| 404 | NOT_FOUND | ENTRY_NOT_FOUND, TODO_NOT_FOUND, ROUTE_NOT_FOUND |
| 405 | UNIMPLEMENTED | METHOD_NOT_ALLOWED |
| 415 | INVALID_ARGUMENT | UNSUPPORTED_MEDIA_TYPE |
| 500 | INTERNAL | INTERNAL_ERROR |

405 includes an Allow header. The 405 and 415 mappings preserve this API's HTTP semantics rather than strictly adopting Google's RPC-to-HTTP mapping. The browser client uses relative API URLs and is served from the same origin through Worker Static Assets. Local Vite development proxies `/api` to the Worker; CORS is not required.

## Todos API

Todos are independent of time entries. Completing one never creates a time entry.
All routes remain unauthenticated, just like the existing entries API.

| Method | Path | Result |
| --- | --- | --- |
| POST | `/api/v1/todos` | 201 with a new OPEN todo; body contains only `title` |
| GET | `/api/v1/todos` | 200 with `{ "items": [...] }`, including all statuses |
| GET | `/api/v1/todos?filter=...` | 200 with matching items, filtered in memory |
| PATCH | `/api/v1/todos/:id` | 200 with the updated todo; provide `title` and/or `status` |
| DELETE | `/api/v1/todos/:id` | 204 without a body; deletion is permanent |

A todo contains `id` (a decimal string), `title`, `status` (`OPEN` or `COMPLETED`),
`created_at`, and `updated_at`. Timestamps are server-generated integer UNIX
seconds. Creation sets both timestamps and defaults status to OPEN. There is no
completion timestamp. All list results are ordered by numeric ID descending.
There is no pagination or silent truncation; open items persist across days.

Titles contain 1–500 Unicode scalar values. **Titles are preserved exactly**:
no trimming or normalization, and whitespace-only titles are accepted. Empty
strings are rejected. This differs from the existing entries title rules.

PATCH is partial: omitted fields stay unchanged, while explicit nulls, an empty
object, unknown fields, and invalid types are rejected. Status values are case
sensitive. Set `{"status":"COMPLETED"}` to complete or `{"status":"OPEN"}` to
reopen. Repeating identical values preserves `updated_at`; changing whitespace
counts as an edit. Multiple edits in the same second can share a timestamp, so
`updated_at` is not a version token. Title and status updates are atomic, and
concurrent edits to different fields do not overwrite each other. Concurrent
edits to the same field are last-write-wins.

POST rejects client-supplied IDs, timestamps, or status. Duplicate titles are
allowed; POST has no retry deduplication. IDs must be positive integers in the
signed 64-bit range. Updating or deleting a missing todo returns 404 with
`TODO_NOT_FOUND`; repeated deletion also returns 404. Existing JSON body limits,
Content-Type handling, error envelopes, and `Cache-Control: no-store` apply.

### Filtering

`filter` is an optional UTF-8 expression encoded as **URL-safe Base64 without
padding** (`-` and `_`, no trailing `=`). Do not encode a JSON object. Only the
`filter` query parameter is supported; the old proposed `status` query parameter
is not implemented. Omitted, empty, or decoded whitespace-only filters return all
items. Unknown or repeated query parameters return `INVALID_FIELD`.

The expression context exposes string fields `id`, `title`, `status`, and i64
fields `created_at`, `updated_at`. For example, before encoding:

```text
status = 'OPEN'
status = 'COMPLETED'
status = 'OPEN' AND title.contains('计划')
created_at >= 1793808000 AND (status = 'OPEN' OR title.starts_with('Review'))
id = '12'
matches(title, '^Review')
```

Expressions use the syntax and built-ins from `filter-expr` and
`filter-expr-evaler` **0.4.1**, directly from crates.io.
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

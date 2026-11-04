# Tickmark server

A Rust workspace for completed time entries. `core` owns validation, business operations, and the asynchronous `TimeEntryRepository` trait. `cloudflare-worker` implements HTTP and D1 persistence. Core has no platform dependencies.

## Local development

Requirements: rustup, Node.js 22 or newer, and npm. Run every command below from `server/`. No Cloudflare account is needed locally.

```sh
rustup show
cargo install worker-build --version 0.8.7 --locked
npm ci
cp -n cloudflare-worker/wrangler.example.jsonc cloudflare-worker/wrangler.jsonc
npm run db:migrate
npm run dev
```

`rust-toolchain.toml` selects Rust 1.97.1, rustfmt, Clippy, and the `wasm32-unknown-unknown` target. Wrangler is pinned in `package-lock.json`. `worker-build` must be on PATH; its version is pinned in the installation command above. The first build downloads its Wasm build tools.

The API runs at `http://localhost:8787`. Local D1 data persists under `cloudflare-worker/.wrangler/state/` across restarts. The tracked `wrangler.example.jsonc` contains a placeholder database ID suitable for local development. Copy it to the ignored `wrangler.jsonc` once; keep deployment-specific account and database IDs in that local file. The copy command preserves any existing configuration. Local commands always use isolated local storage. There is no authentication or token configuration in this version.

## API

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
| 400 | INVALID_ARGUMENT | INVALID_JSON, INVALID_FIELD, INVALID_TIME_RANGE |
| 404 | NOT_FOUND | ENTRY_NOT_FOUND, ROUTE_NOT_FOUND |
| 405 | UNIMPLEMENTED | METHOD_NOT_ALLOWED |
| 415 | INVALID_ARGUMENT | UNSUPPORTED_MEDIA_TYPE |
| 500 | INTERNAL | INTERNAL_ERROR |

405 includes an Allow header. The 405 and 415 mappings preserve this API's HTTP semantics rather than strictly adopting Google's RPC-to-HTTP mapping. CORS is deferred until a browser client's origin is defined.

## Build checks

No automated tests or test scripts are included.

```sh
cargo fmt --all -- --check
cargo check -p tickmark-core --locked
cargo clippy -p tickmark-core --locked -- -D warnings
cargo check -p tickmark-cloudflare-worker --target wasm32-unknown-unknown --locked
npm run build
```

`npm run build` compiles Wasm, generates the JavaScript entrypoint, and performs a Wrangler deployment dry run. It does not deploy or create remote resources. The build runs in the Worker crate because the workspace root is a virtual Cargo manifest. Rust accesses bindings through the SDK, so TypeScript Env generation and Node.js compatibility flags are unnecessary here.

## Remote deployment

API base URL: https://tickmark-server.peterlitszo.workers.dev/api/v1/entries

If your local `wrangler.jsonc` already binds the deployed `tickmark` database, authenticate with `npx wrangler login`, then use the migration and deployment commands below. A fresh checkout only contains the template; configure the target account and database before deploying.

For a separate account or installation, create a new database:

```sh
npx wrangler login
npx wrangler d1 create tickmark
```

In `cloudflare-worker/wrangler.jsonc`, set `account_id` to the target account ID and `database_id` to the database ID returned by Cloudflare. Keep the binding name `DB`. Then apply the migration and deploy:

```sh
npx wrangler d1 migrations apply DB --config cloudflare-worker/wrangler.jsonc --remote
npm run deploy
```

The deployed API has the same unauthenticated behavior as the local API. No remote resources are required to build or verify this repository.

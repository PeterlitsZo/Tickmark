# Todo backend validation — 2026-11-05

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

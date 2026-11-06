# Web validation record

Status: the implementation and local acceptance checks below are complete, with the platform coverage limitations listed at the end. This is a record of manual checks, not an automated test suite. No test files or test dependencies were added.

## Environment

- Date: 2026-11-04.
- macOS development host; Node.js 24.3.0 and npm 11.8.0.
- Rust 1.97.1 selected by `server/rust-toolchain.toml`; Wrangler 4.157.0.
- Chrome 156.0.0.0 through the browser tools, desktop and 390 × 844 mobile emulation.
- Packaged site and API: `http://127.0.0.1:8791`.
- Vite development site: `http://127.0.0.1:5174`, proxying to the same local Worker.
- Isolated local D1 via the example config and `.wrangler/web-local`; no production data or deployment used.

## Completed engineering checks

The following commands completed successfully after the current implementation changes:

```sh
npm --prefix web ci
npm --prefix web run lint
npm --prefix server run build:local
npm --prefix server run build
```

The combined build includes generated typed routes, TypeScript checking, Vite production assets, Rust release Wasm, and Wrangler deployment dry run. Wrangler discovered eight static files and both DB and ASSETS bindings. Vite emitted approximately 331 kB for the main JS chunk (106 kB gzip), 107 kB for the calendar chunk (30 kB gzip), and 14 kB CSS (4 kB gzip).

From `server/`, these checks also passed:

```sh
cargo fmt --all -- --check
cargo check -p tickmark-core --locked
cargo clippy -p tickmark-core --locked -- -D warnings
cargo check -p tickmark-cloudflare-worker --target wasm32-unknown-unknown --locked
```

`git diff --check` passed. The route generator emits a non-fatal circular-dependency warning from its CLI; generation and compilation complete successfully.

## Completed manual checks

| Area | Action and observed result |
| --- | --- |
| Same-origin rendering | Loaded the packaged calendar and read entries from the local Worker API. |
| Basic editing | Created an entry through the editor and edited its exact start/end seconds; saved values matched the API response. |
| Layout | Inspected desktop calendar, desktop right editor, mobile calendar and mobile editor. Compact block text was adjusted after spotting clipping on a short entry. |
| Drag persistence | Dragged Deep work with real browser pointer input. Exactly one PUT was sent, containing only title/start_time/end_time. Server data matched the proposed position. A 5,400-second duration and the original 17-second offset were preserved. |
| Unknown update result | Intercepted browser fetch to let PUT commit, then throw before returning the response. The UI retained a locked proposed block and Check status / Retry actions. Check status confirmed the saved record, cleared the pending state, and showed Changes confirmed; the write log still contained only one PUT. Restored native fetch afterward. |
| Unknown create result | Let POST commit, then discarded its response. Check status found a match; explicit Use existing entry closed the editor. The API contained exactly one matching entry and the log contained one POST. |
| Unknown delete result | Let DELETE commit, then discarded its response. Checking reported absence without assuming deletion. Explicit Retry deletion received 404, cleared pending state and closed the editor. Only the original delete and the explicit retry were sent. |
| Drag with editor open | At 1,200px width, moving a block down 42px while its editor closed produced exactly one PUT shifting both endpoints by 1,800 seconds. Pointer-cancel removed the preview with no write. Drag displacement now uses pointer delta plus scroll delta, so a header layout change cannot alter saved times. |
| Read failure and retry | Temporarily returned HTTP 500 to range reads. The error banner and Try again appeared; removing the simulated failure and retrying restored the normal page. |
| Stale chunk recovery | Dispatched the Vite preload-error event while a draft was open. The reload banner appeared and the draft remained intact; no automatic navigation occurred. |
| Gesture cancellation and selection | In Chromium 149.0.7827.55, a reverse pointer selection produced 09:50–11:20. Escape and window blur removed the preview without opening an editor or sending writes. Holding near the bottom edge increased scrollTop from 694 to 1,101. A horizontal-only drag sent no write. |
| Offline pointer access | After disabling the network, clicking an existing block opened its editor with Save disabled. The pointer handler was adjusted to allow reading/editing drafts offline while preventing entry movement writes. |
| WebKit | Playwright WebKit 26.5 completed create/read/delete for a repeated New York hour. The editor exposed UTC−04:00 and UTC−05:00; selecting the second end occurrence produced a 1h 30m duration and retained seconds after reopening. No page errors were observed. This checks WebKit, not the installed Safari application or a physical iPhone. |
| WebKit mobile | At 390 × 844 with touch/mobile settings, the calendar had no horizontal overflow; tapping Add opened the editor, focused the title, and kept Save visible. See the supplemental capture below. |
| Resize | Dragged the end handle with browser pointer input. One PUT preserved start `1793754017` and snapped end to `1793761200`. The resulting editor showed the saved range. See the recording below. |
| Offline editor | Chrome network emulation set navigator.onLine to false. Save was disabled, the offline notice appeared, and title fields remained editable. Reconnection restored online state. |
| Validation boundaries | Unicode whitespace-only and 501 emoji titles were rejected. Exactly 500 emoji saved successfully, preserving both original timestamps during a title-only edit. End-before-start was rejected. Error focus initially failed while the fieldset was disabled; after the focus effect fix, title and end errors focused their corresponding controls. The fixture was restored afterward. |
| Draft protection and history | Changed a title, clicked Next day and dismissed the discard prompt: date and draft remained unchanged. Accepted the prompt: date advanced and editor closed. Browser Back restored the previous date without reviving the discarded draft. |
| Cross-day cache | Created a 23:30:17–00:30:17 entry. Day one showed only its start handle; day two showed only its end handle. Moved it to day three through the editor: cached day one and current day two removed it, day three showed the exact saved seconds. Deleted the owned fixture afterward. |
| Mobile transport interoperability | Loaded the unchanged mobile `src/api/entries.ts` module with its origin explicitly set to the isolated local Worker. It created an entry that Web displayed; Web changed the title; the mobile module read that change with exact timestamps, then deleted it. Web Refresh removed the record. This verifies the real transport module, not native-device rendering. |
| Native 200% browser zoom | Changed Chromium's `chrome://settings/appearance` zoom control to 200% in a temporary browser profile. A 1,440px window then reported a 720 × 456 CSS viewport. The packaged calendar and editor had no horizontal overflow, all form controls fit horizontally, Save remained operable through normal scrolling, and an empty-title error focused the title. This used browser zoom, not CSS scaling or viewport emulation. |
| Narrow-screen keyboard | At 768 × 1,024, the editor had no horizontal overflow and Tab from Save wrapped focus to Close editor. |
| Dense drag | A second isolated 1,000-entry day used ten-minute records starting one minute apart. Moving fixture 600 by one hour sent exactly one PUT. Initial maximum frame gap was 417 ms. Memoizing unchanged entry blocks and formatting their labels once reduced the observed maximum to 175 ms and the 95th percentile to 24 ms (50 sampled frames, including commit). This is an improvement, not a claim of consistent 60 fps at 1,000 entries. Both fixture runs were cleaned up by their owned IDs. |
| Dense data | Created 100, then 500, then 1,000 overlapping entries on an initially empty isolated day. Request-to-render times were 42 / 115 / 245 ms, measured through DOM mutation plus two animation frames; DOM counts were 821 / 3,221 / 6,221. These are single local desktop observations, not statistical or device benchmarks. The 1,000-row chooser opened in 189 ms and caused no horizontal page overflow. Removed all 1,000 owned fixture IDs and confirmed the day was empty. |
| Routing matrix | Rechecked the packaged build: root and calendar returned HTML 200/no-cache; unknown navigation returned the SPA shell; missing script returned 404/no-store even with navigation headers; `/api` and unknown API returned JSON 404/no-store; PATCH collection returned JSON 405 with Allow GET, POST. |
| DST day boundaries | Invoked the actual time module in Chrome for America/New_York. 2026-03-08 returned 82,800 seconds; 2026-11-01 returned 90,000 seconds. |
| DST civil times | Actual `occurrences` returned no candidates for 2026-03-08 02:30, and two distinct candidates, 3,600 seconds apart, for 2026-11-01 01:30. |
| Routing and caching | Page navigation `/calendar` returned HTML with no-cache; API misses returned JSON 404 with no-store, including navigation headers; missing `/assets/*.js` returned 404/no-store. Existing hashed CSS/JS returned the correct MIME and immutable cache policy. |

The initial drag implementation accidentally included `id` in the update body through an object spread. The server correctly rejected that payload. The API serializer now explicitly selects the three editable fields; the successful drag check above was performed after that fix.

Native Static Assets SPA fallback returned HTML for a missing script during local validation. The implementation therefore uses explicit Rust page-navigation fallback through ASSETS with `not_found_handling: none`, preserving missing-resource and API errors.

## Packaged interface captures

The four primary screenshots were captured from the built site served by Wrangler, not from the design mockups. The supplemental WebKit capture used the Vite development server:

- [Desktop calendar](docs/validation/desktop-calendar.png)
- [Desktop editor](docs/validation/desktop-editor.png)
- [Mobile calendar](docs/validation/mobile-calendar.png)
- [Mobile editor](docs/validation/mobile-editor.png)
- [Resize an entry and open its editor](docs/validation/resize-entry.mp4)
- [WebKit mobile calendar](docs/validation/webkit-mobile-calendar.png)
- [Editor at native 200% browser zoom](docs/validation/zoom-200-editor.png)

## Final packaged review

After a clean `npm ci`, reran lint, generated routes, type checking, both combined dry-run commands, and `git diff --check`. Restarted Wrangler with the final asset manifest. The final desktop (1,536 × 987) and mobile (390 × 844) pages displayed all six demonstration records without horizontal overflow; the desktop console had no warnings or errors. Replaced the four primary screenshots with captures from this final packaged build. All four hashed CSS/JS files returned 200 with correct MIME types and immutable caching. Temporary performance and interoperability records were removed; only the six local demonstration entries remain.

`npm audit --omit=dev` reported zero production dependency vulnerabilities. The full install reported 11 moderate development-tool dependency advisories; no forced dependency downgrade was applied.

## Coverage limitations

- Firefox 151.0 could not start: Playwright launch timed out after 180 seconds with macOS sandbox-extension and framebuffer initialization errors before loading the app. Installed Safari was not driven; WebKit coverage above is not a claim of Safari application verification.
- Physical iOS Safari and Android Chrome touch behavior is not verified by desktop mobile emulation.

These items are not represented as passing merely because the source contains a corresponding implementation.

## Existing-service preview correction

The initial delivered preview used the isolated D1 demonstration data. Development now defaults to proxying `/api` to `https://tickmark.peterlits.me` with the target host header. The delivered localhost:8791 preview was switched to that Vite proxy. Direct and proxied reads of the same day returned identical data (nine entries), and the browser displayed nine real entries without the demonstration titles. Only reads were performed against the existing service. Type checking and lint passed after the proxy configuration change. The screenshots above remain captures of the isolated validation fixtures.

## Duration-accurate layout correction

Removed the 36px minimum entry height and the 3px spacing previously used in overlap grouping. Columns now derive from the actual half-open time ranges; adjacent records share the full width. Blocks retain their exact clipped duration. Short labels use a compact row when they fit; thinner records retain a hover title and remain accessible through Browse entries. Tiny blocks use the editor instead of overlapping resize handles. Point markers remain annotations anchored at their exact timestamp.

Read-only browser inspection of the existing-service day confirmed seven full-width records and only the two genuinely intersecting records sharing columns. Five-, ten-, and thirty-minute records measure 7px, 14px, and 42px at the current scale. No service records were modified. Earlier screenshots and dense-layout measurements predate this correction.

## Stable calendar layout refinement — 2026-11-04

Implemented the plan in `plans/20261104/05/main.md`. The desktop details column is always reserved; opening or closing an editor only changes its contents. Below 760 CSS px, the editor overlays an inert calendar instead of resizing or hiding it. The count/list toolbar, empty-day copy, timeline footer, and decorative headings were removed. Global status, recovery controls, transient notices, and preload-update notices share a portal at the bottom right. Routine saves no longer produce success toasts.

Verification used disposable Chromium contexts and in-memory API interception. No test files were added and no production writes were made. A separate unmodified development page loaded the real API successfully (21 rendered records at the time, no runtime errors or error cards). The normal development proxy remains pointed at the real service; fixtures exist only in the verification browser contexts.

### Geometry and responsive checks

At 900px viewport height, the timeline rectangle and scrollTop stayed identical before, during, and after editing:

| Width | Timeline x / y / width / height | scrollTop |
| --- | --- | --- |
| 1440 | 204 / 56 / 932 / 844 | 768 |
| 1280 | 204 / 56 / 772 / 844 | 768 |
| 1024 | 0 / 56 / 736 / 844 | 768 |
| 768 | 0 / 56 / 480 / 844 | 768 |
| 390 (touch emulation) | 0 / 104 / 390 / 796 | 768 |

No document overflow occurred at these widths. Touch uses a consistent two-row 104px header with 44px controls; it does not change when editing. Desktop uses a 56px header. At 1440px, first create, editing a visible entry, deleting the last entry, a delayed save, uncertain save, explicit retry, offline mode, failed reads, and read recovery all retained the same timeline geometry and scroll. Initial pending load to an empty day also retained geometry. Keyboard navigation may intentionally scroll a previously off-screen record into view; that is distinct from an editor-driven layout change.

Chromium's actual browser zoom was set to 200% through Settings. At a 720 × 456 CSS-pixel viewport, the document had no horizontal overflow and Save remained reachable by scrolling the editor independently. The notification reserve shrinks with viewport height, leaving form space on short windows. At this size the visible Save button ended at y=298.82, inside the form ending at y=314.95.

### Interaction and feedback checks

- Empty titles and IME Enter confirmation caused no POST; ordinary Enter issued one POST and closed the editor after success.
- A 16:00-ending record did not intercept a drag starting at 16:00. The new draft was 16:00–16:30; changing its end to 17:00 produced a 96px draft.
- Both edges of 5-minute and 10-minute records independently adjusted the intended endpoint by ten minutes in pointer checks. No write reached the live service.
- Cancelling a dirty form and rejecting the confirmation preserved the draft.
- The uncertain-save notification remained in the bottom right, 16px from both edges on desktop, without overlapping Save. Check status, explicit retry, and adopting an existing matching record worked; adoption did not issue a second write.
- Mobile background was inert while editing and restored on close. Forward/reverse Tab wrapping and Escape focus restoration to Add entry worked. Notification action buttons were keyboard reachable.
- Transient notices remained visible during more than five seconds of hover and keyboard focus, then expired after interaction ended.
- Repeated preload-error events produced one update card in the same notification host, without an automatic reload.
- Draft text now uses the same `.block-content` geometry as saved records, including short-record styles and bottom gap. Title and time offsets matched at 10, 30, and 65 minutes (same title used for inline short-record comparison).

### Artifacts and limitations

Screenshots are archived in `docs/refinement/` (and next to the local plan): `before-desktop.png`, `desktop-idle.png`, `desktop-new.png`, `desktop-notification.png`, `empty-day.png`, `mobile-editor.png`, `zoom-200.png`, and `draft-alignment.png`. These are explicitly isolated demonstration data, not screenshots of the user's records. Desktop, new-entry, notification, empty-day, mobile, and zoom images were visually inspected; a clipped last column in the mini calendar was fixed during review.

`npm --prefix web run lint` and `npm --prefix web run build` passed, including TypeScript checking. The existing TanStack CLI circular-dependency warning remains non-fatal. This refinement has not been deployed. Touch checks use Chromium emulation; native Safari, physical devices, screen-reader speech, and on-device virtual-keyboard behavior were not verified in this pass.

### Follow-up: remove the native date-jump trigger

Removed the header's native date-picker trigger and its focus-within wrapper, plus the duplicate sidebar Back to today action. Today and previous/next day controls remain; the desktop mini calendar remains. Text-field focus now uses a thin border-aligned highlight instead of an offset outline, with invalid-field color preserved. Keyboard-focused buttons retain a visible outline. Start/end fields still use native datetime-local controls; this change does not replace those browser pickers.

At 1440px and touch-emulated 390px, next/previous day navigation worked, the removed trigger was absent, the document had no horizontal overflow, and the new-entry title retained autofocus with the border-aligned highlight. Lint and production build passed. This follow-up remains local and is newer than the screenshots above.

### Deployment of the layout refinement

Deployed to `https://tickmark.peterlits.me` on 2026-11-04, version `7f2e718b-5337-4cec-a2c1-2e0a395b8a3c`. This supersedes the local-only status above. Homepage and calendar navigation reference the latest build; calendar JavaScript and both CSS bundles match local artifacts byte-for-byte. A live read-only browser check confirmed the permanent Details panel, absence of the date-jump trigger and entries toolbar, successful API loading, and no runtime errors. No production records were modified during verification.

## Todo page (2026-11-05, local only)

Added `/todos` and calendar navigation. `npm --prefix web run build`, `npm --prefix web run lint`, and `git diff --check` passed. The existing TanStack CLI circular-dependency warning is non-fatal. No automated test files or dependencies were added.

Browser checks used an isolated Chromium instance, Vite on port 5174 with an explicit proxy to the local Worker on port 8792, and D1 under `server/.wrangler/web-local`. No production data was changed.

- Created a todo, edited its title, completed it, viewed Completed, reopened it, viewed All, reloaded, and deleted it with confirmation. The API retained surrounding spaces and emoji exactly. The temporary todo was removed afterward.
- Verified Open/Completed/All against the actual API, including empty states. Default Open was restored on reload.
- Interrupted a POST connection: the draft remained, further writes were locked, and the user could inspect All and explicitly allow changes after checking. There was no automatic write retry.
- Rejected a navigation confirmation and retained the draft on `/todos`.
- Checked 500 versus 501 emoji characters and composition Enter handling without creating records.
- Visually reviewed desktop 1280px, mobile 390px, and calendar navigation at 320px. Fixed the narrow calendar header to keep the Todos link accessible. A separate touch-emulated 390px viewport had no horizontal overflow.

Native Safari, physical devices, screen-reader speech, and virtual keyboards were not verified. This feature has not been deployed.

## Integrated calendar and todos (2026-11-05, local only)

This supersedes the separate Todo page layout above. Todos now stay in the main calendar's right column. Entry details open below them; mobile uses a collapsible bottom workspace instead of a modal. `/todos` redirects to the calendar.

Validation used the current frontend on Vite port 5174 and a local Worker on port 8792. Concurrent category development restarted the original Worker during a request, so the remaining checks used an isolated server snapshot at commit `4596bda` and a copy of the local database. The interrupted write retained its title draft and recovered after refreshing and explicit acknowledgement. No production data was touched. Initial temporary records were removed from the original local database; demonstration records remain only in the isolated preview copy.

Verified in Chromium:

- Added and edited todos with surrounding spaces and emoji; completed, reopened, cancelled deletion, and confirmed deletion from the calendar. A new time entry was saved while the todo list remained available. Todo changes preserved an open entry draft.
- Todo drafts survived date navigation, panel collapse/expansion, and viewport resizing. A delayed POST completed successfully after changing the calendar date, without resubmission.
- Confirmed writes update the local list even when the following GET fails. Offline mode disabled writes and preserved the draft. Writes never automatically retried.
- Completed items are disclosed in the same panel. The old `/todos` URL ended at `/calendar` with the panel visible.
- At 1440×900, an overflowing list scrolled 200px while the add input stayed at y=63 and the entry editor stayed at y=397. The timeline retained its 844px height. Entry fields and todos have separate scroll containers.
- At touch-emulated 390×844, entry fields scrolled 193px while the action footer remained at y=775. At 320×568, the timeline still had 100px of usable height and Save remained within the viewport. The selected 90-minute block was fully visible at 390px after the bottom workspace expanded. No horizontal document overflow was present.
- Both drafts survived collapse and resizing. Rejecting the entry discard prompt kept its draft. Escape from a todo input did not close the entry editor.
- No browser runtime errors were captured. Build (including TypeScript), lint and whitespace checks passed. No automated tests or test dependencies were added.

Actual screenshots are saved under `plans/20261105/02/`: `implemented-desktop.png`, `implemented-mobile.png`, and `implemented-mobile-editor.png`. They show isolated demonstration data. Native Safari, physical-device keyboards, and screen-reader speech remain unverified. This implementation has not been deployed.

### Production deployment of integrated todos

Deployed application commit `11a77f7` to `https://tickmark.peterlits.me` on 2026-11-05, Worker version `47afe794-66d5-4ede-ac28-82a27fe39085`. This supersedes the local-only status above. The release includes the previously committed todo and category APIs.

Exported D1 before deployment, temporarily paused API access, applied migrations 0002 and 0003, and then published the final Worker and assets. No migrations remain pending. All 48 pre-existing time entries retained their IDs, titles, start times and end times compared with the backup. Todo create/complete/reopen/delete and legacy entry create/update succeeded; the entry update retained its category. Temporary verification records were deleted.

Live Chromium checks confirmed the integrated Todos panel, no runtime errors, and no horizontal overflow at 390px. HTML and all four JS/CSS bundles matched local build artifacts byte-for-byte. The backup and deployment screenshot remain in the ignored local plan folder.

## Entry categories — 2026-11-05

Implemented on top of the completed integrated-Todos baseline (`08888f5`). These are manual browser interactions and request inspections, not a new automated test suite. No tests or dependencies were added.

Environment: Chrome 156.0.8078.80 in an isolated Playwright browser, Asia/Shanghai time zone; Vite at `127.0.0.1:5175` proxying to local Worker `127.0.0.1:8794`. The example Wrangler configuration used a fresh local D1 at `server/.wrangler/web-categories-20261105`, with all three existing migrations applied. No production requests, deployment, or backend changes were made.

Final checks passed: `npm --prefix web run lint`, `npm --prefix web run build` (including generated routes and TypeScript checking), and `git diff --check`. The existing non-fatal TanStack Router circular-dependency warning remains.

| Area | Observed evidence |
| --- | --- |
| Empty database | The editor showed `Default (created on save)`. Its POST omitted category_id; the server returned an entry and created category ID 1 named Default with GRAY. No separate category POST was sent. |
| Selection and writes | With multiple categories, a new entry selected ID 1. Explicit creation sent category_id 2. Changing only the category sent a PUT with unchanged title and times and the new ID. |
| Management | Created Work/BLUE, changed it to Focus/PURPLE, created Study/GREEN from an entry draft, and deleted an unused category. The entry retained its title/times and selected the newly created category on return; focus returned to Manage categories. |
| Rename propagation | Renaming Default to Work and changing its color immediately updated the existing block's accessible category name and mapping. |
| Reference protection | Deleting a referenced category displayed CATEGORY_IN_USE inline. Repeating from November 6 also failed when the referenced entry was on November 5. |
| Input boundaries | Whitespace-only and 101-character names were rejected inline; a 100-character name saved and could be deleted. Same-name categories remained distinct with ID suffixes. Name trimming uses the same Unicode White_Space rule as the server. |
| Movement | Pointer drag sent category_id 2 with both times shifted by 1,800 seconds. Resizing the end sent category_id 2 and changed only the end by 900 seconds. Reloading and reopening retained selection. |
| External deletion | Deleted an unused selected category through a separate API request, then saved the stale draft. The UI retained its title/time and missing ID, showed the error, refreshed options and disabled saving until explicit reselection. |
| Read failure and offline | An injected category GET 500 disabled saving and retained the draft. Retry restored options. Offline disabled writes without losing inputs. |
| Category response loss | Allowed POST/PATCH/DELETE to commit then discarded their responses. Create remained uncertain after refresh, without matching by name or automatically resending (one POST). PATCH and DELETE checks confirmed the saved state/absence. |
| Category timeout | Delayed a committed POST response for 17 seconds, beyond the client's 15-second limit. The UI retained the uncertain operation and draft; exactly one POST was issued. Explicit stop-tracking and subsequent unused-category deletion worked. |
| Entry matching | Aborted a create whose title/times matched an entry in another category. Check status offered no match. After an explicit retry committed in the selected category but lost its response, Check status offered the correct matching entry and explicit Use existing entry completed recovery. Entry deletion also worked. |
| Future enum | Injected FUTURE_COLOR in a read. The editor displayed its neutral/unknown state. A name-only update sent only `{name: ...}`, preserving the unknown color rather than writing GRAY. |
| Keyboard | ArrowRight moved the selected color from PURPLE to PINK. Escape closed management and returned focus to its trigger. Radio controls retain native keyboard behavior and a visible focus outline. |
| Layout | Inspected 1440 × 900 desktop, 390 × 844 touch viewport, 320 × 568 touch viewport, and 720 × 450 effective CSS viewport (equivalent available layout space to 1440 × 900 at 200%). No document horizontal overflow. Management body and entry fields scroll while actions remain accessible; collapsing Todos makes more editing space available. |
| Review fixes | Category badges now precede titles. Verified 10/15/20/30/35/40/55-minute blocks. A short Chinese title reproduced the reported squeeze; the final non-shrinking, container-capped badge shows 生活 completely. The same label measures 29.22 × 14 CSS px in both 15- and 30-minute blocks. |
| Contrast | All eight category text/background token pairs have calculated WCAG contrast ratios from 5.94:1 to 7.55:1. Labels, selection outlines, checkmarks, and accessible names provide non-color cues. |
| Todos regression | Created, completed, expanded completed items, reopened, collapsed and expanded Todos while entry/category UI remained usable. |
| Runtime | No browser page errors were observed during these interactions. |

Implementation screenshots are in `plans/20261105/03/`: `implemented-desktop-calendar.png`, `implemented-desktop-categories.png`, `implemented-mobile-entry.png`, `implemented-mobile-categories.png`, plus deletion protection, narrow/zoom-equivalent layouts and short-duration badge reproductions. Original `design-*.png` files remain design concepts. The user's review moved badges from below the time to before the title, with uniform dimensions across durations.

Coverage limits: these category checks use desktop Chrome and emulated touch/viewport sizes, not physical phones or current Safari/Firefox. The 200% check uses equivalent CSS viewport dimensions rather than an OS/browser zoom control. No claim of new cross-browser or production verification is made. Pending operation state remains memory-only, with navigation/unload safeguards; an explicit retry can still duplicate a delayed create.

### Remembered category follow-up

New-entry defaults now read `tickmark.last-created-entry-category` from localStorage. Only successful creates (including explicit acceptance of a matching saved entry) update it; edits and cancelled drafts do not. The same selection helper handles both an already-cached list and the editor's first asynchronous category read. Missing IDs fall back to the first server-ordered category; an empty list retains the Default creation path. Both storage reads and writes tolerate browser security/quota errors.

Using the same isolated Chrome/local Worker environment, created an entry in category 3 and observed stored value 3; reloaded and opened a new entry and observed selected value 3. Changed a draft to category 2 then cancelled; the next draft still selected 3. Replaced the preference with a nonexistent signed-64-bit ID and observed fallback to 1. Made the localStorage getter throw SecurityError: the new draft still selected 1 and saved successfully. Lint, TypeScript/build, and diff whitespace checks passed. No test files were added.

## Todo notes and autosave — 2026-11-05

Implemented the revised inline design against the current unified todo list. Ran `npm --prefix web run lint`, `npm --prefix web run build`, and `git diff --check` successfully. The existing route-generator circular-dependency warning remains non-fatal. No test files or dependencies were added.

Manual Chromium browser sessions used Vite at localhost:5173 with all `/api/v1/**` requests intercepted by an in-memory fixture. No production writes or deployment were performed. These checks validate browser behavior against the new API contract; they do not replace a deployed API integration check after migration 0004.

- Continuous input for 21 seconds produced five description-only PATCHes, spaced 5,070 / 5,063 / 5,055 / 5,052 ms apart. The trailing value was saved and the textarea retained it. No page errors occurred.
- A 6.5-second response delay preserved newer input and serialized the next write. Moving focus from title to notes sent no early PATCH. Leaving the task flushed changes.
- HTTP 500 retained the draft and sent no timed retry. Checking the server exposed explicit recovery; choosing the local draft saved it. Offline edits persisted in localStorage; reconnect read and saved the draft. Reload retained text and exposed recovery choices.
- An empty title did not prevent a valid notes-only PATCH. A 500-emoji title and 10,000-emoji note saved; 10,001 note characters stayed local. Clearing notes sent an empty description. Completion/reopening preserved notes.
- Synthetic composition events held unfinished Chinese input locally and resumed saving after composition ended. This is event-level verification, not a physical operating-system IME check.
- A 404 retained copyable notes and exposed Dismiss draft. Denied localStorage writes showed the recovery warning. Deletion during a delayed write executed PATCH start → PATCH end → DELETE, leaving zero rows.
- Inspected desktop and 390px touch screenshots. The title appears once, with muted notes and no document icon or Save/Cancel form. The native mobile dialog makes background controls inert; closing it restored focus to the task. At 390px and 768px there was no horizontal overflow. A Chromium 200% CSS-zoom check also showed no horizontal overflow (not a native browser-zoom or physical-device check).

Screenshots: [desktop](docs/validation/todo-notes/desktop.png), [mobile](docs/validation/todo-notes/mobile.png).

Remaining platform coverage: physical iOS/Android keyboards, installed Safari, assistive-technology announcements, and production migration/deployment integration were not exercised in this pass. Cross-device same-field writes still use server last-write-wins semantics; recovery is not transactional conflict resolution.

### Cloudflare deployment — 2026-11-05

Applied remote D1 migration `0004_add_todo_description.sql`, then deployed the current workspace frontend and Rust Worker together to https://tickmark-server.peterlitszo.workers.dev. Worker version: `5ab16272-2cf9-44ec-84ff-4c5b58cf0ea1`. The production build and Wrangler dry run passed before deployment.

A Chromium session opened the deployed calendar (HTTP 200), edited the notes of a dedicated temporary todo, and confirmed the five-second autosave through a fresh API read. No page errors were reported. The verification todo was deleted afterward (HTTP 204). This closes the production migration/API integration check noted above; physical-device and assistive-technology coverage remains unchanged.

### Inline editing refinement

Restored desktop titles to 12px/400 and matching editing metrics. Removed routine save labels, the editor rail, and notes minimum heights; error/recovery feedback remains. Notes previews still clamp to two lines. Mobile inputs retain 16px without the enlarged 18px title. Autosave scheduling and API contracts are unchanged.

Lint and production build passed. A manual Chromium fixture session confirmed title styling at 12px/400, empty and one-line notes at 19px, three lines at 58px, shrinking back to 19px, and no Saved label. No test files were added. This refinement has not been deployed.

### Pointer switching and caret placement

Mouse presses on another todo's title/notes no longer move focus before its click is delivered. Task switching starts the previous draft flush without waiting for the network. Title clicks capture the text offset before replacing the preview and restore that position in the textarea, instead of unconditionally moving to the end. Keyboard/menu activation retains the end-of-text default.

Lint/build passed. Manual Chromium pointer input confirmed zero vertical displacement between mouse-down and mouse-up on the next task, successful activation, and caret offset 5 in a 17-character title after clicking its middle. No test files were added; not deployed.

### Native text selection

Desktop todo titles and notes now retain their textarea nodes between browsing and editing. Removed pointer-down cancellation and coordinate-based caret reconstruction. An unfocused editor collapses after an active pointer gesture completes, so another row stays in place while dragging. Empty notes hide on blur and inactive notes retain the two-line limit.

Manual Chromium verification: zero target displacement on mouse-down when switching tasks; dragging selected characters 1–10, double-click selected the word “Second”, and moving focus to quick-add hid both empty note fields. Lint and build passed before the final Escape focus adjustment; final lint and typecheck also passed. No test files added; not deployed.

### Todo interaction refactor

Replaced per-row global listeners and local edit flags with one panel-level interaction controller. Extracted stable CSS-sized native fields, exceptional feedback, and mobile dialog ownership. Removed the old resizing effects, click-position reconstruction, and obsolete editor CSS. Autosave storage and API behavior remain in the existing store.

Manual Chromium and WebKit sessions with intercepted local API fixtures observed:

- Switching from one task to another: target displacement stayed at zero during mouse-down; only one empty-note placeholder remained visible during the gesture.
- Fast drag selected characters 0–11; single-click placed a collapsed caret at offset 4; double-click selected “Second”. Keyboard Shift+ArrowRight selected offsets 2–4 in both engines.
- Notes height was 19px for an empty field or one line, 77px for three lines plus a trailing newline, and returned to 19px when shortened. Menu activation focused notes reliably.
- Mobile 390px inputs used 16px text with a 26px empty line. Back saved Chinese notes and returned focus to the originating task in both engines.
- A timed notes edit emitted a description-only PATCH after five seconds, without a Saved label. A simulated HTTP 500 retained the draft and displayed exceptional feedback.
- No page errors occurred in the desktop interaction sessions. Inspected a desktop capture for text alignment and absence of borders/status labels.

Final lint, production build, and whitespace checks passed. No test files were added. These are local browser-engine checks, not physical-device validation; this refactor has not been deployed.

### Truncated notes disclosure

Desktop and mobile previews now expose Show more only when measured content exceeds the two-line viewport. The indicator responds to content and width changes; activating it expands and focuses notes. Manual Chromium checks at 1280px and 390px showed exactly one disclosure for a three-line note and none for a two-line note. Activation focused the description with all three lines visible. Lint/build and whitespace checks passed; not deployed.

### Inline truncation indicator (replaces Show more)

Removed the disclosure button, overflow state, and ResizeObserver. Collapsed desktop notes now paint the existing mirror with CSS two-line clamping and an inline ellipsis; the same textarea remains above it for native hit testing and selection. Mobile previews use the same CSS clamping treatment. Expanded text uses the native textarea presentation.

Chromium and WebKit manual checks at 1280px and 390px confirmed an ellipsis for three-line notes and none for exactly two lines. Desktop height remained 38.375px before and after settling, and throughout mouse-down/drag; after release it expanded to 57.5625px while preserving selection offsets 1–12. No Show more button remained. Inspected desktop/mobile captures. Lint, build, and whitespace checks passed; not deployed.

## Calendar edge dragging (2026-11-06)

Removed visible resize handles and their overlay buttons. Mouse hover and pointer-down now share the same hit calculation on the visible content button. Each edge uses at most 4px, shrinking to preserve at least 8px of central movement space. Visible fragments below 12px and zero-duration entries only move. Clipped day boundaries cannot resize; touch and pen input use the existing tap/long-press movement flow and editor for time changes.

Manual Chromium verification used an isolated local page with intercepted API responses and captured writes, without production data or new test files:

- Checked 5, 10, 15, 20, 30, and 60-minute blocks, zero duration, overlapping columns, both cross-day clipping directions, and visible heights immediately below/at/above 12px.
- Central mouse drags preserved duration and emitted one write per release for every duration sampled. Top and bottom drags changed only the corresponding endpoint; the initial mode remained fixed as the pointer crossed into the body.
- For a 22px visible block, mouse positions below 4px and at/above 18px selected resize; the central interval selected move. The visual gap did not hit the block. A real drag starting at 3.5px used start resizing, shifted only the start by five minutes, and wrote once.
- Escape and pointer cancellation produced no writes. Keyboard Enter and a touch tap opened the editor. No resize-handle elements remained.
- Chromium touch emulation confirmed that a long press at the top edge moved the entire block and preserved duration. A swipe scrolled the timeline without a write. Mouse edge resizing remained available after touch input.
- Lint, production build, and whitespace checks passed. The existing build-tool `replaceRouteChunk` circular-dependency warning remains non-blocking.

Physical touch devices and Safari were not validated in this pass. No deployment was performed.

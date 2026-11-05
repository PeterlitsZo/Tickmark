# Calendar / Todos tabs acceptance

Recorded November 5, 2026. This record covers the current source changes; previously linked APKs and simulator archives predate them. Design proposals remain in `plans/20261105/04/`. No automated tests were added, and no production data was written.

## Environment

- Expo SDK 58; iPhone 17 Pro simulator, iOS 26.3; Android API 37.1 emulator with Expo Go.
- Isolated local Worker at `127.0.0.1:8790`, migrations 0001–0003 applied to `/tmp/tickmark-tabs-d1`.
- Metro used `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8790`; Android reversed ports 8081 and 8790.
- Screenshots are actual native captures. The floating gear belongs to Expo Go, not Tickmark.

## Completed observations

- Both platforms show bottom Calendar / Todos tabs and category-colored timeline blocks. Todos are independent of the selected date.
- Both platforms retained unsaved todo input across tab switches. Android retained `Mobile draft` exactly. iOS retained its input method's composed string; this was checked through the accessibility hierarchy rather than normalized text.
- Android created `Mobile draft`, changed it to `Mobile draft updated`, completed it, expanded completed items, reopened it, and deleted it through both confirmation dialogs. Local API reads confirmed the corresponding values and final deletion. iOS also completed a todo.
- iOS changed only entry 1's category from Work (1) to Study (2). API reads confirmed title `Prepare release` and timestamps `1793854800` / `1793859300` were unchanged.
- iOS changed Work's color from BLUE to ORANGE. Eight labeled radio choices were available. Attempting to delete referenced Study returned the category-in-use explanation without clearing the form. Errors scroll into view.
- Returning from category management restored the original entry editor, title, selected category, and duration. Editor accessibility exposed its controls while hiding background tabs; `accessible={false}` on the sheet fixed grouped/hidden children.
- A one-shot debugger fetch wrapper forwarded an Android todo POST to the isolated service, then discarded its response. The API contained exactly one `Recovery draft`; the UI retained the draft, disabled further writes, and offered Check status. Switching to Calendar and back retained the lock. Check status refreshed the list and required an explicit risk acknowledgment before allowing more changes. The wrapper restored the original fetch after that one request.
- Todo order remains newest ID first after local cache updates and refresh. IDs are compared as decimal strings.
- Source review covered category retention in gesture PUT payloads, pending-operation caches, dirty checks, uncertain-save matching, empty-library/default handling, unknown color preservation, and origin-scoped preference storage.

- Android created `Preference check` with Study (2), then force-stopped and relaunched Expo Go. The next new-entry editor defaulted to Study rather than lowest-ID Work.
- Android Wi-Fi and mobile data were disabled: the cached calendar remained, the draft stayed visible, and Save was disabled with an offline message. Connectivity was restored.
- Native layouts were inspected at 320 dp with 1.3 font scaling and at approximately 390 / 430 dp. Todo titles wrapped, inputs and tabs remained reachable, and the calendar header wrapped its actions on the narrow configuration.
- A cold-start splash hang surfaced during configuration changes. Hiding the splash in a layout effect after the navigation shell mounts, and after window/font changes, resolved the observed startup block. A subsequent force-stop/cold launch opened Calendar without debugger intervention.

## Build checks

`npm run typecheck`, `npm run lint`, `npx expo install --check`, and `npm run export` passed. Export generated iOS and Android Hermes bundles; this is not an installable release build. `git diff --check` passed.

## Captures

- [iOS calendar](implemented-ios-calendar.png), [Todos](implemented-ios-todos.png), [entry editor](implemented-ios-editor.png), [category editor](implemented-ios-categories.png), [referenced-category refusal](implemented-ios-category-error.png).
- [Android calendar](implemented-android-calendar.png), [Todos](implemented-android-todos.png), [lost-response recovery](implemented-android-recovery.png).

- [320 dp / large font](implemented-android-320-large-font.png), [390 dp](implemented-android-390.png), [430 dp](implemented-android-430.png), [remembered category](implemented-android-remembered-category.png), [offline editor](implemented-android-offline.png).

## Verification boundaries

These are simulator checks and source review, not a physical-device or release-build certification. VoiceOver/TalkBack traversal, hardware haptics, Xiaomi/Gboard behavior, every storage-failure/racing-device permutation, and a complete rerun of the older DST/cross-day/edge-scroll matrix are not claimed passed by this record. Existing geometry and time conversion code was retained; earlier evidence is historical, not proof for every current combination. Drafts survive navigation, not process termination. Distribution packages were not rebuilt or published.

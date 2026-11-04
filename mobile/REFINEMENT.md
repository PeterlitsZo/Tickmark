# Mobile refinement progress

Tracks implementation of `plans/20261104/03/main.md`. The existing `VALIDATION.md` describes the earlier 1.0 build; its results do not establish acceptance of this revision.

## Baseline and open issues

| Issue | Current evidence | Acceptance needed |
| --- | --- | --- |
| Oversized editor | Existing 510-line editor includes large title field, separate date/time groups, offset rows, and duration row | Compact content-sized sheet, readable at large text sizes |
| Keyboard gap | User-reported on Xiaomi Android with Gboard; no evidence that the device or keyboard causes the bug | Reproduce and verify repeated keyboard transitions in development and release builds |
| Existing blocks cannot move/resize | Unified create/move/resize controller implemented; ordinary move and both handles verified on Android with local API reads | Cross-day, zero/short/dense blocks, scrolling, cancellation, uncertain writes and iOS gestures still need runtime acceptance |
| Unnecessary tabs | Removed the tabs route group and Entries screen; old Entries route redirects home | Verify deep links and dense-entry selection without a list tab |
| Inconsistent icons | Header and refresh actions now use Lucide through IconButton | Complete editor actions and new launcher assets |
| Native date/time controls | Community picker used by editor and date header; native dependency/plugin removed | DST, large text, repeat transitions and regenerated native builds |
| Coupled state and UI | Timeline and editor still own multiple responsibilities | Extract interaction, editor, geometry, and mutation responsibilities |

## Changes verified so far

- Single calendar route added; bottom navigation removed.
- Calendar screen moved out of the route module into its feature directory.
- Header spacing reduced; date strip retains accessible touch targets.
- Query notices now overlay the timeline instead of changing its height during loading.
- Shared icon button added with accessibility labels and 44-point targets.
- Typecheck and lint passed after these changes.
- Android Expo Go showed the single-page calendar with local data, updated icons, and no bottom tabs. Screenshot: `/tmp/tickmark-refinement-single-page.png`.

## Dependency investigation

Installed through Expo CLI: Bottom Sheet 5.2.14, React Native UI Datepicker 3.3.0, Lucide React Native 1.67.0, and Expo-compatible react-native-svg 15.16.0. Bottom Sheet's published peer ranges accept the current Reanimated and Gesture Handler versions. Runtime compatibility, keyboard behavior, and time-picker UX are not yet proven; the standalone sheet/picker prototype remains the next gate.

No automated tests added. No production writes performed.

## Editor prototype in progress

- Extracted editor session/write logic to `useEntryEditor`; operation status is a discriminated string union rather than independent busy/missing/uncertain flags.
- Replaced the oversized layout with a content-sized Bottom Sheet and compact time rows. Added a themed community date/time selector with draft-local Done/Cancel semantics.
- Typecheck and lint pass. Android shows the compact editor; keyboard transitions are still under investigation and have not passed acceptance. No claim of a Xiaomi/Gboard fix yet.
- Native picker dependency removal, iOS runtime verification, repeated keyboard transitions, fixed save visibility, and mutation/session lifecycle hardening remain pending.

### Keyboard and picker prototype follow-up

- Reproduced a hidden sheet with the keyboard open in Android Expo Go using `android_keyboardInputMode="adjustResize"`, without a Fast Refresh transition. Evidence: `/tmp/tickmark-sheet-keyboard-clean.png`.
- Changed the sheet to `adjustPan`, which allows its interactive keyboard positioning to run. Set Expo's Android `softwareKeyboardLayoutMode` to `pan` for the next native build. This native configuration does not affect Expo Go and still needs standalone validation.
- Android/Gboard shows the complete sheet and Save action adjoining the keyboard. Captured ten back-to-dismiss/title-to-reopen cycles at `/tmp/tickmark-keyboard-cycle-01.png` through `10.png`; the final capture remains correctly positioned.
- iOS Expo Go also shows the compact editor with its Save action above the keyboard: `/tmp/tickmark-ios-sheet.png`, `/tmp/tickmark-ios-sheet-keyboard.png`. This is preliminary runtime evidence, not release or Xiaomi device acceptance.
- The community time view renders directly with separate hour/minute wheels. Removed its irrelevant month navigation in time mode.
- Added `pickerTime.ts`: the picker operates on neutral UTC wall-clock fields, while the adapter applies the device IANA zone. Date changes preserve time including seconds; explicit time changes use minute precision. Nonexistent local times produce a visible correction notice; repeated-time offset alternatives remain available. DST runtime verification is still required.
- Typecheck and lint passed after the adapter changes. No production writes or automated tests were added.

## Move/resize and editor implementation

- Extracted `timelineGeometry`, `useTimelineInteraction`, `useEdgeAutoScroll`, `TimeBlock`, and `ResizeHandles`. Active gestures use shared values; preview labels cross to JS only on snapped value changes. Backgrounding cancels active previews. The current implementation includes frozen columns, original-position dimming, dense-entry choices, and constrained 44pt endpoint targets; these edge cases still need runtime acceptance.
- Added `entriesQueries` for query keys/cache updates and `useEntryMutations` for per-entry replacement locks, pending previews, one-shot writes, old/new-range reconciliation, and explicit retry. Interrupted POST/PUT and server 5xx responses are treated as uncertain. Fault-injection verification is still pending.
- Editor PUT now uses the same mutation path. Draft closing compares the original session object; unmounted editors do not report request errors into a new session.
- Split `EntryForm` from the sheet container. Save is a Bottom Sheet footer; scroll content reserves its measured space. The close handle invokes the same draft guard without closing/reopening the sheet first.
- DateHeader now reuses the community date selector. Removed the native datetimepicker dependency and Expo plugin; generated native projects have not yet been regenerated.

### Local Android evidence

Using Expo Go and isolated API on port 8790, record 9 (`Connection check`):

1. Long press without movement retained selection handles and left 14:00–14:45 unchanged. `/tmp/tickmark-hold-selected.png`.
2. Body move changed 14:00–14:45 to 14:30–15:15, preserving 2700 seconds. `/tmp/tickmark-move-result.png` plus API read.
3. Start handle changed only start from 14:30 to 14:15; end remained 15:15. `/tmp/tickmark-resize-start.png` plus API read.
4. End handle changed only end from 15:15 to 15:30; start remained 14:15. API now reports start `1793772900`, end `1793777400`.
5. Fixed-footer editor renders compactly and the Save action remains above Gboard. `/tmp/tickmark-fixed-footer.png`. The keyboard capture `/tmp/tickmark-footer-keyboard.png` includes Fast Refresh and must be replaced with a clean acceptance capture.

These observations do not yet prove request counts, cancellation, edge cases, or standalone behavior.

### Community picker compatibility patch

Pinned `react-native-ui-datepicker` to 3.3.0 and added a reproducible `patch-package` postinstall patch. On iOS, opening 14:15 initially changed the minute to 00 without user input; its programmatic animated wheel synchronization fired a selection callback. Disabling animation for that synchronization preserved 14:15 after a full reload, and a manual minute-wheel drag selected 16. Evidence: `/tmp/tickmark-ios-time-done.png` (failure), `/tmp/tickmark-ios-wheel-no-animation.png` (correct initial value), `/tmp/tickmark-ios-minute-scroll.png` (manual change).

The patch also gives the wheel container its actual five-row height (5 × 44pt) rather than a 150pt parent around 220pt wheels. Source, CommonJS, and ESM builds receive the same changes. Reapplying the patch succeeds. Recheck the initial value, manual scrolling, Cancel, and Done before upgrading this dependency; do not drop the patch solely because the library version changes.

The adapter passes a UTC Dayjs value so initial picker fields and subsequent timezone-normalized state agree. Date selection was verified visually on iOS (Nov 5 selected); full DST acceptance remains pending. Latest typecheck and lint passed. No automated tests or production writes were added.

- iOS date Done changed the draft from Nov 4 14:15 to Nov 5 14:15, preserving the time; no Save was pressed. `/tmp/tickmark-ios-date-applied.png`. Date/time application now immediately displays start/end validation errors without changing the other endpoint.

### Gesture cancellation session guard

Added a generation token carried from UI-thread activation through queued JS callbacks. Changing the date, opening an editor/chooser, losing connectivity, backgrounding, Android window blur, and unmounting invalidate the generation and stop the preview. Stale begin/finish/label callbacks cannot restore canceled state or submit a write. Android notification-drawer blur is handled separately from AppState changes. Runtime acceptance of notification-drawer behavior is still pending.

Manual Android Expo Go checks against isolated local API 8790, with temporary in-memory fetch logging restricted to that origin:

- Dragged record 9 from 14:15–15:30 to a visible 14:40–15:55 preview, pressed Home before release, then reopened Expo Go. Preview disappeared; zero write requests were logged; API retained start `1793772900`, end `1793777400`. Captures: `/tmp/tickmark-before-background.png`, `/tmp/tickmark-after-background.png`.
- A subsequent ordinary drag/release logged exactly one PUT and moved the same record to 14:45–16:00 (`1793774700`–`1793779200`), preserving 4500 seconds.
- Long press without movement added no request (the log still contained exactly that one PUT). Restored the original fetch function after observation.
- Typecheck and lint passed. No automated tests were added. These observations cover simulator interaction, not Xiaomi hardware or release-build acceptance.

### Shared visual metrics and anchored entry choices

Added `theme/metrics.ts` for spacing, radii, type sizes, icon geometry, and control sizes. IconButton, editor time rows/title, and resize handles now consume these values; gesture hit testing and pure timeline geometry share the same 44pt target constant without importing React Native. No dimensions were changed by this extraction.

Dense-entry choices now receive the tap's viewport coordinate, measure their rendered height, and clamp their position to the viewport. Their scrolling content is bounded by the available height. Android Expo Go manual check: tapping the short Review notes block opened an anchored chooser containing Design review and Review notes; choosing Review notes opened the correct compact editor without a keyboard. Captures: `/tmp/tickmark-choices-anchored.png`, `/tmp/tickmark-choice-editor.png`. This used existing isolated local records and performed no writes. Large-font/small-screen acceptance remains pending.

Typecheck and lint passed after both changes. No automated tests were added.

### Approved app icon and native resource regeneration

Presented two original vector directions with 24/48px previews. The user selected A / Timeline. Added editable SVGs and a deterministic librsvg/ImageMagick asset-generation script. Generated opaque 1024px iOS/store artwork, Android adaptive foreground/background/monochrome resources, and a matching splash mark. Inspected the full 1024px icon and the actual-size small previews; the iOS mark is larger than the Android adaptive foreground to account for platform masking.

Installed SDK-compatible `expo-splash-screen` using `expo install`, configured its background/image through `app.json`, and ran `expo prebuild --no-install`. The CLI regenerated both native projects. The generated Android manifest uses `adjustPan`; launcher XML references foreground, background, and monochrome resources. iOS references the generated SplashScreen storyboard. No generated native code was edited manually. Typecheck, lint, and `expo install --check` passed. Native installation and launcher/splash acceptance are not yet complete.

- Expo Doctor passed all 20 checks after the icon/splash changes. Both native JavaScript bundles exported successfully (`/tmp/tickmark-refinement-export.log`). Android circle, rounded-square, and monochrome mask previews are in `assets/icon-directions/masks.png`; visual inspection found no clipped artwork. Installed launcher acceptance remains separate.
- Android Expo Go with system font scale 1.3: calendar and compact existing-entry editor remained readable; Gboard opened with Save visible and the card adjoining the keyboard. Captures: `/tmp/tickmark-font-130-editor.png`, `/tmp/tickmark-font-130-keyboard.png`. Restored the original scale 1.0 afterward. No entry was modified. This does not establish arbitrary accessibility sizes, small-screen coverage, release behavior, or Xiaomi behavior.

### Manual uncertain-PUT response-loss check

On Android Expo Go, temporarily wrapped fetch in memory only for `http://127.0.0.1:8790/`. Allowed a normal drag PUT to reach the isolated server, then dropped its response by throwing before the app could receive it. The client issued exactly one PUT, followed by GETs for the original and requested ranges and the calendar refresh. It confirmed the server result without another PUT and cleared the pending state. Record 9 moved from 14:45–16:00 to 15:15–16:30 (`1793776500`–`1793781000`), retaining its 4500-second duration. API read and `/tmp/tickmark-response-loss-reconciled.png` confirm the final position. Restored the original fetch function and removed observation globals afterward. Definite rejection, persistent uncertainty/retry, and 404 still need current-revision acceptance.

- Definite PUT rejection: a temporary local-only fetch override returned HTTP 400 / INVALID_TIME_RANGE for a drag. Exactly one PUT attempt was observed; the block returned to 15:15–16:30. `/tmp/tickmark-put-rejected.png` records the restored position. The transient notice had cleared before capture, so this capture does not prove its text. Restored fetch afterward; no write reached the server in this case.

### Persistent uncertainty and explicit retry

Temporarily rejected all local API fetches in the Android Expo Go runtime. Dragging record 9 requested 15:45–17:00. It remained visibly Pending, with original and requested times and Check again / Retry change actions. Tapping the pending entry did not open the editor. Initial call log was one PUT and two reconciliation GETs; no automatic repeated PUT occurred.

Restored connectivity while retaining request logging. Check again read both ranges and kept the operation uncertain because the server still had the original values. Retry change displayed the overwrite warning; confirming Retry issued one additional PUT. The pending state cleared, a saved notice appeared, and the isolated server returned `1793778300`–`1793782800` (15:45–17:00). Complete call sequence: PUT, GET, GET, GET, GET, PUT, GET. Restored fetch and removed all instrumentation globals afterward.

Evidence: `/tmp/tickmark-put-uncertain.png`, `/tmp/tickmark-put-rechecked.png`, `/tmp/tickmark-put-retry-confirm.png`, `/tmp/tickmark-put-retry-saved.png`. No production data was accessed or modified by the overrides.

### Native iOS and gesture boundary follow-up

The local-API iOS Release simulator build succeeded and was installed independently of Metro. Launcher artwork, compact editor, and keyboard were observed; captures and launch video are under `docs/validation/refinement/`. A fresh install shows the configured splash mark, but the launch recording contains dark opening-transition frames; this is not yet a passed cold-launch check. The archived local simulator build predates the following gesture refinements and is not a production deliverable.

Moved drag timing/duration into a viewport-clamped floating label, independent of narrow overlapping columns. Resize targets now share content-boundary clamping between rendering and gesture hit detection; narrow short blocks retain separated 44pt targets. Snap changes invoke selection haptics only when the snapped time changes; physical feedback still requires hardware verification. Delayed editor alert actions now reject unmounted sessions before initiating writes or changing state.

Android Expo Go manual observation: the floating label displays 16:10–17:25 / 1h15m while moving record 9; switching Home cancels the preview. Server values remained 15:45–17:00. A local-only midnight fixture (record 10) remained exactly zero-duration after holding without motion; dragging its end saved 00:00–00:25 with start unchanged. Screenshots: `floating-drag-label.png`, `midnight-zero-selected.png`, `midnight-resized.png`. Typecheck/lint passed. Android Release build succeeded; an incremental rebuild includes the final editor guards. Current native release acceptance remains in progress.

### Current native Release acceptance

Rebuilt and installed both platforms after the floating-label, bounded-handle, and stale-editor-action changes. Both builds succeeded. Local-only archives:

- `build/tickmark-refinement-android-local.apk`: SHA-256 `c12d727af290302d247db3d34e978883e6dc5afdee8c5a7f029f6e99863a6449`.
- `build/tickmark-refinement-ios-local.zip`: SHA-256 `2dc55b90f21096a6c6d9d0b17512d2d4736e1905a4607e01997a199702614dcc`.

These are validation builds using `http://127.0.0.1:8790`, not phone-ready production builds. Android was verified to contain the local URL before installation; the installed native Android app now points to the isolated API, replacing the earlier production build.

Android Release + Gboard: existing-entry editor does not autofocus. Ten cycles of Back to hide keyboard, close editor, reopen entry, and focus title showed Save visible and no exposed band between sheet and keyboard. Inspected all ten captures in `android-release-keyboard-ten-cycles.png`; full individual captures are in `/tmp/tickmark-release-keyboard-cycle-*.png`. This is emulator evidence, not Xiaomi verification.

Both native Release time wheels open at the existing 15:45 without changing to 00:00 and scroll to 15:46. Android Cancel returns to 15:45. iOS Done displays draft 15:46; closing prompts to discard; server remains 15:45. Discarded the iOS draft. No server write was made by these picker checks.

Android native drag moved record 9 from 15:45–17:00 to 16:15–17:30, preserving 4500 seconds; API read confirms `1793780100`–`1793784600`. Then dragging its start moved it back to 15:45 while end remained 17:30. Evidence includes `android-release-drag.mp4` and corresponding preview/saved captures. Request-count evidence remains from the instrumented Expo Go observations, not this native capture.

### Small-screen and repeated-hour native checks

Android local Release at 320×560 dp (840×1470 px, density 420), font scale 1.3: new-entry autofocus opens Gboard. The content scrolls to reveal both time rows and duration while Save stays fixed above the keyboard. Inspected both initial and scrolled captures. Restored screen size and font scale afterward.

Changed the emulator timezone to America/New_York and navigated to November 1, 2026 using the shared header calendar. Timeline shows both 01:00 ticks with UTC−04:00 and UTC−05:00. Created isolated fixture 11 from first 01:30 (`1793511000`) to second 01:30 (`1793514600`). Its time picker offers the alternative offset. Choosing UTC−05:00 for start and Done changes only the draft to a time point; API still returned the old start until Save. Save persisted start=end=`1793514600`. Restored Asia/Shanghai afterward.

This exposed a presentation omission: the editor summary did not distinguish the two repeated wall-clock times. Added offset text beneath an ambiguous time only; ordinary time rows remain compact. Also allowed date labels to shrink/wrap within their available width. This final change requires fresh native builds and visual verification; prior binaries do not include it. No automated tests were added.

- Spring DST check (Android Expo Go, current source): navigated to March 8, 2026 in America/New_York. The timeline skips the nonexistent 02:00 hour; 01:30–03:30 has one hour of elapsed duration. Moving the start-time hour wheel from 01 to 02 normalizes to 03:30 with an explicit nonexistent-time warning and Cancel/Done controls. Canceled without saving. Fixture 12 remains `1772951400`–`1772955000`; timezone restored to Asia/Shanghai. Captures: `android-go-spring-timeline.png`, `android-go-spring-warning.png`.

### Production-origin Android preview

Built `build/tickmark-refinement-arm64-preview.apk` from current source, including ambiguous-time offset labels. SHA-256: `654d23c81abb55e81179b92162e9da1b95b5156a161fe9d541d994c4bcdd49b2`. The bundled JS contains the production HTTPS origin and does not contain the local validation origin. APK signature verification passed; it uses the development/debug signing key and is a sideloadable Release preview, not a store release.

Installed on Android emulator, force-stopped and launched independently of Metro. The calendar loaded existing production entries. This was read-only; no production entry was opened, modified, or deleted. Kept that screenshot in `/tmp/tickmark-production-launch.png` rather than committing production content as fixture evidence. Restored the local-API APK afterward; the installed native validation APK predates the latest offset-label change.

Remaining completion gates include current-source native verification of the offset label, cross-day/cache and edge auto-scroll coverage, current 404 handling, iOS repeated keyboard/gesture checks, startup-transition investigation, refreshed final artifacts/checks, and a consolidated plan-to-evidence record. Physical Xiaomi/Gboard and physical haptics remain explicitly unavailable; emulator results do not establish those device-specific outcomes.


### Deleted-entry reconciliation and Android environment inputs

On the isolated API, fixture 13 was loaded in Android Expo Go and then deleted externally (HTTP 204). Dragging its cached block produced HTTP 404. The block disappeared and the UI reported that the entry no longer exists. Captures: `android-go-before-404.png`, `android-go-after-404.png`. No production writes were performed.

A subsequent local Android rebuild reused a production JavaScript bundle because Gradle did not track `EXPO_PUBLIC_API_BASE_URL`. Only date navigation and scrolling occurred before this was detected; the native app was stopped. Added `scripts/android-build-inputs.gradle` to track that variable and production dotenv files. An initial optional-file declaration failed when `.env` was absent; the final file collection supports absent files. Updated the README build recipe.

The rebuilt APK succeeded and was inspected before copying or installation: the local origin is present and the production origin is absent. Installed this verified APK successfully. Current `build/tickmark-refinement-android-local.apk` SHA-256: `71880cab5eb50c7ddfcf9f0bec1c1ca6c82a9785a72464ebc72b51ad0273c0c2`. This supersedes the earlier local APK checksum. The production preview artifact remains unchanged. Typecheck and lint passed. No automated tests were added. Switching origins in both directions with the new build recipe still needs explicit verification.

Current iOS Release was rebuilt successfully with the ambiguous-time summary change and its bundle was verified to contain the local origin before installation. Its archived ZIP has not yet been refreshed. Cross-day fixture 14 remains unchanged; cross-day movement acceptance is still pending. The other completion gates listed above remain open.


### Cross-midnight movement and iOS keyboard repetitions

Current isolated Android Release: loaded November 3 before returning to November 4. Fixture 14 initially spanned Nov 3 23:30–Nov 4 00:30 (`1793719800`–`1793723400`). Selection shows its full date/time label, a continuation arrow and only the true end handle. Moving the block down 30 minutes saved `1793721600`–`1793725200` (Nov 4 00:00–01:00), preserving the full 3600-second duration. Returning to November 3 and scrolling to the end showed no stale fragment; the API also excludes the moved record from that day. Captures: `crossday-selected.png`, `crossday-moved.png`, `crossday-old-date.png`.

Current isolated iOS Release: ten consecutive editor focus/close/reopen cycles were captured and visually inspected together. All show the title, both time rows and fixed Save above the keyboard, without a band of timeline or backdrop between sheet and keyboard. Existing entry reopening does not autofocus. Evidence: `ios-keyboard-ten-cycles.png`; full-resolution individual captures remain in `/tmp/tickmark-ios-keyboard-cycle-*.png`. This verifies the simulator's displayed keyboard configuration, not Xiaomi hardware or all keyboards.


### Native offset summary and iOS resize defect

Current Android local Release in America/New_York: opening the existing repeated-hour fixture shows start 01:15 / UTC−04:00 and end 01:45 / UTC−05:00, with duration 1h30m. Both offset labels fit below the larger time text; dates remain separate compact controls. No save was performed. Restored Asia/Shanghai. Capture: `android-release-offset-summary.png`.

Current iOS local Release: moving record 9 down 30 minutes changed 15:45–18:00 to 16:15–18:30 (`1793780100`–`1793788200`), preserving 8100 seconds. Capture: `ios-release-drag-saved.png`. Subsequent start-handle attempts exposed a native iOS defect: one opened an unsaved create draft, and another moved the entire record by 15 minutes (`1793781000`–`1793789100`) instead of resizing. The create draft was closed without saving. This does not pass edge-resize acceptance.

The installed RNGH Apple source reads raw touch positions from the recognizer host, while pan event positions may use a coordinate view. Updated raw-touch hit testing to measure the timeline viewport on the UI thread and subtract its screen position from absolute touch coordinates. Typecheck and lint pass; native iOS rebuild and behavioral verification are pending. No generated native source was edited.

Dependency compatibility, Expo Doctor (20/20), and both-platform export passed before this final coordinate change; export must be refreshed for final delivery.


The coordinate hypothesis did not fix the iOS resize issue. Temporary native observation showed raw touch and measured viewport positions agree: x=86, content y=1356.67, within the selected start handle around block top=1356.5. The handle pan had not activated while the long-press gesture took over. Replaced zero-distance automatic pan activation with explicit manual activation on a matching handle touch. Removed the unsuccessful viewport measurement change and all temporary diagnostics. Fresh native builds are being checked before this is considered resolved.


Android native offline check: enabled airplane mode and disabled Wi-Fi. Cached entries remain visible with an offline notice. A held drag did not change fixture 9 (`1793781000`–`1793789100`); opening its editor still works, with Save and Delete disabled and an inline offline message. Closed without changes and restored airplane/Wi-Fi settings. Captures: `android-release-offline.png`, `android-release-offline-editor.png`.


Native diagnostic observation resolved the remaining resize cause: touch-down hit `resizing-start` at y=311; the iOS pan's `onStart` did not arrive until y=290, followed by one update at that same y. Initializing the anchor in `onStart` discarded all 21 points of travel. The native recognizer still applies its movement threshold even with manual activation. The final implementation captures handle type, entry and pointer position at touch-down, then starts and updates from that origin once activation arrives. A losing recognizer's finalize callback is also prevented from canceling the other recognizer's active operation. Temporary local-only diagnostics on port 8791 were removed and the diagnostic listener stopped. No production requests or automated tests were involved. Native verification of this final fix is in progress.

### Native iOS resize verified

Final native Release with captured touch-down origin: dragging the start handle changed fixture 9 from 16:30–18:45 to 16:15–18:45 (`1793780100`–`1793789100`). Dragging the end handle then changed it to 16:15–19:00 (`1793780100`–`1793790000`). Isolated API reads confirm that each operation preserved its opposite endpoint. Screenshots: `ios-release-resize-start.png`, `ios-release-resize-end.png`. This supersedes the earlier failed resize observations; no production data was changed.

Final source passed typecheck and lint, and both native Release builds succeeded. The iOS simulator build uses `DEBUG_INFORMATION_FORMAT=dwarf` to avoid exhausting local disk space while generating the optional dSYM. Android local artifact SHA-256: `9ec85d45ace199b52e32b2b7fb6ac7166879d8f069d61a59692753e481955572`; its bundled origin was checked before installation. Production preview and archived iOS ZIP still need refreshing before final delivery.

Native iOS edge auto-scroll: dragged fixture 9's end handle to the lower viewport edge and held it there. The timeline scrolled from the afternoon to the final hours; end stopped exactly at day boundary `1793808000` (Nov 5 00:00), while start remained `1793780100`. Capture: `ios-release-edge-resize.png`.

Final both-platform export passed. Rebuilt production Android preview from the resize-fixed source; SHA-256 `92943319108b3d9156140e88a3b0117254ff831a4a7df02982be4133099cfa68`. Inspected the bundled bytes: production origin present, isolated local origin and temporary diagnostic port absent. The environment change triggered JavaScript rebundling, confirming local-to-production invalidation. README checksum updated. This supersedes earlier production preview checksums.

Native iOS movement at the upper edge: dragged fixture 9 toward the top and held for six seconds. Auto-scroll reached the start of day; the complete 7h45m duration was preserved at `1793721600`–`1793749500` (00:00–07:45). Other records remained in their columns during movement and the final overlapping layout is visible in `ios-release-edge-move.png`.

Production-to-local rebuild also reran JavaScript bundling. Its APK contains only the isolated origin and reproduces SHA-256 `9ec85d45ace199b52e32b2b7fb6ac7166879d8f069d61a59692753e481955572`. Both environment-switch directions now pass. Refreshed the final-source local iOS simulator archive: `build/tickmark-refinement-ios-local.zip`, SHA-256 `6e7d8cc246da11229b2ae2d555a85f5ab51709f1f5ad00cf76d9697c8d646b1e`. Production Android APK signature verification passed.

Native iOS creation also auto-scrolls: a blank-area long drag from 04:00 toward the lower edge produced a 04:00–23:35 draft, shown in `ios-release-edge-create.png`. Closed using X without saving. Fixture 9 was then explicitly reset through the isolated API to 16:15–19:00 for Android regression checks.

Android final regression exposed a platform difference: the new manual handle activation caused a quick handle drag to scroll instead of resize. Restored Android's previously verified zero-distance automatic activation while retaining explicit activation on iOS and the shared touch-down origin capture. Fresh native validation and replacement artifacts are required; the APK/ZIP hashes above currently predate this platform-specific correction.

### Platform-specific activation regression passed

Final Android native Release: start handle changes 16:15–19:00 to 16:00–19:00 (`1793779200`–`1793790000`); end handle then changes it to 16:00–19:15 (`1793779200`–`1793790900`). Both fixed endpoints are preserved. Final iOS native Release after refresh: start changes to 15:45 with end 19:15 unchanged; end drag enters the lower auto-scroll zone and ends at 19:55, with start unchanged (`1793778300`–`1793793300`). API reads and final captures confirm these results. Captures use `android-release-final-{start,end}.png` and `ios-release-final-{start,end}.png`.

Typecheck, lint, both-platform export, Android Release and iOS Release builds passed for this platform-specific source. Production APK signature verification passed. Current artifacts superseding earlier hashes:

- Production Android preview: `55676fdcfe18ba65fcb567f2f46ff898d13ce992758c0d56928219337b194ae6`.
- Isolated Android validation APK: `3973cdf74f38704e59a1932cf462a07ef6e91e28a784738b44bb70d285b01dd0`.
- Isolated iOS simulator ZIP: `41b15173b7c46ef82b42e73d27b9bb5ecf9b14ce6a6f87626ae74cef2de72daa`.

The Android emulator is running the final isolated APK. The iOS simulator is running the final isolated app. Production preview was rebuilt and inspected, but its final installation/launch has not yet been repeated. Outstanding delivery work includes final launcher/startup review, before/after comparison, and consolidated plan-to-evidence acceptance. The physical Xiaomi/Gboard case and hardware haptics remain unavailable, not passed.

### Final comparison and editor lifecycle review

Installed the original production-origin APK and the refined production-origin APK to capture the same empty November 6 calendar and unsaved 09:45–10:00 draft. No production writes were performed. Comparison images and measured sheet heights are in `docs/validation/refinement/comparison/README.md`; the new sheet is approximately 349 dp versus 571 dp on the same emulator. The final production preview installed and launched independently. Restored and verified the isolated APK before further writes.

On isolated Android Release, created fixture 15 through the new editor. Set fixture seconds explicitly through the local API to `1793929517`–`1793930419`, then changed only its title through the editor to `Final editor check revised`. API confirmed both timestamps remained exact. Confirmed deletion through the editor removed it from the server and calendar. X, Android Back after hiding the keyboard, and the custom downward handle gesture each displayed the unsaved-draft alert and Keep editing preserved input.

Backdrop acceptance exposed a real omission: Bottom Sheet's `pressBehavior="none"` removes its tap recognizer entirely, so its `onPress` prop never ran. Added an explicit accessible Pressable inside the backdrop, retaining the common close guard and preventing the library from closing the sheet before confirmation. Native rebuild/verification is in progress.

Startup review found the native root background unset. Added the canvas background to Expo configuration and the gesture root, with the installed `expo-system-ui` config plugin. Expo prebuild regenerated both native directories; CocoaPods installation and Android Release build passed. The iOS rebuild is still running. Typecheck and lint pass after both changes. Artifacts must be refreshed again before final delivery.


### Final native closure and precision regression

Both native Release builds now contain the root-background configuration, guarded backdrop Pressable, and minimum-duration snap correction. Android and iOS both display the discard confirmation when tapping outside a dirty draft (`android-release-backdrop-guard.png`, `ios-release-backdrop-guard.png`).

On isolated Android, moving fixture 16 preserved its 42-second duration and endpoint seconds: `1793926817`–`1793926859` became `1793928317`–`1793928359`. Resizing its end toward the start stopped at `1793928900` while preserving start `1793928317`: the minimum is at least five minutes and the changed endpoint is on the five-minute grid. After explicitly setting end to `1793928959` through the isolated API, resizing start toward end stopped at `1793928600`, retaining end `1793928959`. This covers nonzero seconds at both fixed endpoints; see `android-release-resize-seconds.png`.

Android notification interruption canceled an active movement preview of fixture 9. API timestamps remained `1793778300`–`1793793300`, and subsequent interaction worked. All these writes used the isolated API.

Final typecheck, lint, dependency compatibility, Expo Doctor (20/20), both-platform export, Android Release, and iOS simulator Release passed. The production Android bundle was inspected for the correct origin, signature-verified, installed, and launched without Metro; production data was only read. The emulator was restored to the verified isolated APK afterwards. Current SHA-256 values:

- Production Android preview: `9f39f60ebb6e75851ea59d29cc023692bcfcab6387f22af7c43fbb690d6e93b3`.
- Isolated Android APK: `8f63d270bfcbca1881d527ad85ff1acbc5cda0753a987061921c54b55c91c482`.
- Isolated iOS simulator ZIP: `2b5a91f511615f37a7c574e70567aa4b8a9793f0418901819415a133b07d27b5`.

These supersede all earlier artifact hashes. Physical Xiaomi/Gboard and hardware haptics remain unverified. A black transitional frame remains visible in an iOS simulator launch recording despite the generated native root background; clean-install startup review is pending.


Clean-install iOS startup review: uninstalled only the isolated simulator app, rechecked its bundled origin, reinstalled, and recorded launch. At sampled 0.5 seconds the opening rounded window is black; at 1.0 seconds the intended logo is visible; at 1.5 seconds the calendar is visible. The black transition precedes the splash rather than occurring between splash and calendar. Retained this simulator limitation explicitly; no claim of physical-device equivalence or a confirmed OS root cause. Final evidence: `ios-release-final-launch.mp4`, `ios-release-final-splash.png`. This completes the startup review, with the observed transition disclosed.

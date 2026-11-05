# Calendar / Todos update — November 5, 2026

The current source adds bottom tabs, global todos, category management, category-aware entries, and per-origin category preferences. Typecheck, lint, Expo dependency compatibility, and iOS/Android exports pass. Native manual checks used isolated local data. See the [current evidence and limitations](docs/validation/tabs/README.md) for screenshots, lost-response recovery, draft retention, category-only saves, restart persistence, and narrow layouts. No automated tests were added. Previously distributed APKs and simulator archives do not contain this update.

---

> Visual follow-up: entry accents are rectangular children clipped by the outer rounded surface, giving a straight inner edge. Each surface leaves a 2 dp bottom gap (capped at one quarter of very short entries); logical duration, hit geometry and overlap columns are unchanged. Typecheck, lint and Android Release build passed; native read-only visual review confirmed consecutive entries are separated. Android preview was refreshed; iOS/local archives predate this change.

> Follow-up: timeline scale is now 144 dp/hour (previously 81). Entry, drag and draft heights use actual duration with no 24 dp floor. Overlap columns compare timestamps directly. Typecheck, lint and Android Release build passed; installed production preview was checked read-only, confirming 12:20–12:30 and 12:30–13:00 are full-width consecutive blocks. Very short entries may clip their labels; their duration is not enlarged. The iOS ZIP and local validation APK predate this follow-up.

# Current refinement acceptance

Recorded November 4, 2026. This section supersedes the original implementation record below. Manual checks used isolated D1 on port 8790; production preview installation was read-only. No automated tests were added.

| User request | Implementation and evidence | Status / limits |
| --- | --- | --- |
| Polish UI/UX | Single timeline, shared spacing/type/touch tokens, dense-record chooser, offline state, small-screen scrolling. [Before/after](docs/validation/refinement/comparison/README.md). | Native UI reviewed; physical accessibility and feel still need device review. |
| Move blocks and resize edges | Shared UI-thread interaction controller, independent true-endpoint handles, frozen overlap columns, auto-scroll. Both platforms' final start/end captures and Android [gesture video](docs/validation/refinement/android-release-drag.mp4). | Native movement and both handles verified; seconds-preserving movement and minimum-grid resize checked against isolated API. |
| Smaller editor and keyboard gap | Content-sized Bottom Sheet, one keyboard owner, fixed Save footer, existing-entry focus preserved. Approximately 349 dp versus 571 dp before. Both native platforms completed ten keyboard cycles. | No exposed gap in tested simulators. Xiaomi Android + Gboard is explicitly **not yet verified**; no claim that the input method caused the reported gap. |
| Remove Entries tab | Root calendar route and legacy `/entries` redirect; no bottom tabs. | Android deep link and both native screens verified. |
| Better icons | Lucide controls; chosen A direction, scale plus two time blocks. iOS icon, Android adaptive and monochrome assets, splash resources. | Small-size assets and launcher masks reviewed; clean-install iOS splash and calendar launch verified; see transition limitation below. |
| Custom date/time and better proportions | Pinned community picker with shared styles; direct date/time views, large time rows, temporary Cancel/Done values. | Both platforms exercised minute selection and cancellation. DST repeat/spring cases covered in native/Expo Go checks as detailed in the ledger. |
| Code quality | Geometry, gestures, editor sessions, mutations, cache and shared tokens separated; no generated-native edits. | Typecheck/lint, dependency check, Doctor 20/20, both exports and native Release builds pass. |

## Behavioral evidence

- Moving preserves the full duration, including seconds and cross-day ranges. Resizing changes only one endpoint, enforces a five-minute minimum and snaps the changed endpoint to the grid. Zero-duration holds do not silently expand records.
- Native edge scrolling was exercised for creation, movement and resizing. Background/notification interruption canceled previews; subsequent gestures worked.
- Request traces in isolated validation confirmed one PUT after a changed gesture and none for unchanged gestures. Rejection rolls back; 404 removes missing records; uncertain outcomes use reads and an explicit retry flow. Native offline checks retained browsing while disabling writes.
- Editor creation, title-only editing with exact timestamps, and confirmed deletion were verified against local API data. X, backdrop, Android Back and handle dismissal preserve dirty-draft confirmation. Backdrop behavior was rechecked on both final native builds.
- The chooser, short/zero entries, repeated-hour offsets, compact and large-font layouts, and minute-level picker behavior have captures in the [evidence index](docs/validation/refinement/README.md). Detailed observations, failed intermediate attempts and their resolutions are retained in [REFINEMENT.md](REFINEMENT.md).

## Deliverables and remaining limits

The current production-origin Android APK is linked in [README.md](README.md), with its checksum. It was signature-verified, installed and launched independently. The final isolated iOS simulator archive is `build/tickmark-refinement-ios-local.zip`; it requires the local API and cannot be installed on a physical iPhone.

A physical Xiaomi is unavailable. Its Gboard keyboard behavior, hardware haptics and physical-device accessibility are not passed by simulator checks. Physical iPhone distribution requires Apple signing. Clean-install iOS startup displays the intended logo and then the calendar. The simulator recording still contains a black frame during the opening window animation before the splash; this transition is not claimed fixed or representative of a physical iPhone. See [final launch recording](docs/validation/refinement/ios-release-final-launch.mp4).

---

> Historical validation for the original 1.0 implementation. For the current UI/gesture refinement, see [REFINEMENT.md](REFINEMENT.md); the checks below do not establish acceptance of the newer code.

# Implementation validation

Recorded on November 4, 2026. This is a manual acceptance record, not an automated test suite. All write operations below used an isolated local D1 database on port 8790.

## Completed checks

- TypeScript typecheck and Expo lint passed.
- Expo dependency compatibility passed; Expo Doctor passed all 20 checks.
- Both Android and iOS JavaScript/Hermes exports completed successfully.
- The app launched in Expo Go 58.0.7 on an iPhone 17 Pro simulator (iOS 26.3) and Expo Go 58.0.5 on an Android API 37.1 emulator.
- Both platforms displayed the local service's entries, including overlapping blocks, and opened the corresponding list view.
- iOS: a long press followed by a downward drag opened a 70-minute draft. A GET before saving confirmed no record had been created. Saving created the expected range in D1.
- iOS: changing only the title retained both original timestamps. The list immediately displayed the changed title. Confirming deletion removed the record from both the server and list.
- iOS: an ordinary swipe scrolled without opening an editor. Holding a drag at the lower edge produced a longer range through automatic scrolling. Closing the empty draft did not create a record.
- Android: upward dragging produced a 45-minute draft. Saving created the expected range; the list displayed it immediately. Editing its title preserved timestamps, and confirming deletion removed it from D1.
- Both platforms: the save action remained accessible with the software keyboard visible. Android's modal keyboard offset was corrected after observing an obscured save button.
- Month navigation and week navigation were exercised. The iOS month picker displayed selectable historical dates.
- Android: a cross-midnight entry retained its full dates in the editor. Changing its start and end dates moved it out of November 4 and into November 2–3; the November 3 list showed the full range, and the calendar clipped it to midnight with a continuation marker.
- A zero-duration entry appeared beside an overlapping entry and displayed `Time point` in its editor without changing its timestamps.
- iOS: submitting an empty title displayed field validation. Closing a populated unsaved draft asked whether to discard it.
- Android: disabling both Wi-Fi and mobile data displayed the offline notice while retaining the cached calendar. Network access was restored afterwards.
- Android: deleting an open entry through the local API, then saving the editor, displayed the missing-entry message and the close-and-refresh action.
- Android: after restoring connectivity and restarting Expo Go, records were loaded again from the local service and the offline notice cleared.
- Android: in `America/New_York` on November 1, 2026, the timeline showed two 01:00 labels with UTC−04:00 and UTC−05:00. A record spanning 01:15 EDT to 01:45 EST occupied 90 minutes. Its editor displayed both offsets and offered explicit alternate occurrences. The emulator was returned to `Asia/Shanghai` afterwards.
- Changing the device time zone exposed stale Hermes `Date` offsets despite updated locale formatting. Date calculations now use `TZDate` with the native calendar's explicit IANA zone. After switching from New York back to Shanghai and foregrounding the app, Today selected November 4, the record showed 08:45, and the editor showed UTC+08:00 consistently without a runtime restart.
- Android: removing the local API port forwarding caused a create request to fail. The editor retained the draft, displayed the uncertain-save message, and disabled another save. After restoring forwarding, checking found no matching entry; explicitly allowing another save created exactly one matching record.
- Android: creation now requests focus after the modal window opens; the software keyboard appeared automatically with Save visible. The native time picker changed a draft's start to 11:00 using the current picker callbacks, and discarding that edited draft required confirmation.
- Android: sending the app to the background one second into an eight-second drag canceled selection. Returning showed the calendar without a creation editor, and normal scrolling worked again.
- Final Android debug and ARM64 release builds passed (`:app:assembleDebug :app:assembleRelease`, 1,308 tasks). The native debug app loaded the isolated local records, including the localization module.
- The final release APK installed and launched with its bundled JavaScript. It displayed Calendar and Entries while using the production HTTPS API. A separate read-only GET returned 200 and zero entries for the selected day. No production write was performed.

- After the final modal system-bar adjustment, Android native debug and Expo Go both showed the keyboard with Save accessible and no gap exposing the calendar. Typecheck and lint passed again; the release rebuild passed (861 tasks). The rebuilt APK was installed again, launched independently, and displayed the corrected editor layout with the keyboard open; the production draft was canceled without saving.

## Android artifact

`build/tickmark-1.0.0-arm64-preview.apk`, approximately 29 MB, uses the generated development signing key and runs without Metro. Its SHA-256 is `993b5c4b7e737e6b69b28e9c7b28c55947a0d70dbbd3741a1b036d7560af5d5f`. The `arm64` filename distinguishes this final build from earlier local artifacts.

- Regenerated the iOS native project with the final Expo configuration and completed CocoaPods installation (121 dependencies, 120 pods), including ExpoLocalization 58.0.5 and ExpoSystemUI 58.0.7. An unsigned generic iOS device build also stopped at destination discovery because Xcode requires the missing iOS 26.5 platform; no application compile error was reached.

## iOS artifact and final native validation

The Release simulator build completed with `BUILD SUCCEEDED` using Xcode 26.6. The resulting app installed and launched on the iPhone 17 Pro simulator (iOS 26.3.1) with its bundled JavaScript and the production HTTPS origin. The calendar displayed an empty selected day, Add opened the editor, the keyboard appeared automatically, and Save remained visible. The draft was canceled without a production write.

`build/tickmark-1.0.0-ios-simulator.zip` contains `Tickmark.app`; it is a simulator artifact, not an iPhone-installable IPA. SHA-256: `018410f464af83bad7500a57eacab32bc029acbcd563e576c72c7aa77b6ed370`.

The local Xcode SDK build 23F81a initially did not select installed runtime 23F73. `xcrun simctl runtime match set iphoneos26.5 23F73 --sdkBuild 23F81a` made the destinations available. This simulator preference can be reset with `xcrun simctl runtime match set iphoneos26.5 --default --sdkBuild 23F81a`; no SDK files were modified.

## Plan coverage

- Project and connection: independent Expo/TypeScript app, locked dependencies, public origin configuration, native iOS/Android entry points, and HTTPS reads verified.
- Browsing: shared selected date, week/month navigation, timeline and list, empty/loading/error states, overlap columns, cross-day clipping, and zero-duration markers implemented and manually exercised.
- Creation: long-press activation, bidirectional five-minute selection, default fifteen-minute range, edge scrolling, cancellation/interruption, explicit save, and Add alternative implemented; core gestures exercised on both simulator platforms.
- Editing and persistence: title and date/time edits, full PUT payload, confirmed permanent deletion, shared-cache refresh, missing records, offline recovery, and uncertain POST handling implemented and exercised against isolated local D1.
- Time semantics: UNIX seconds, explicit native IANA zone, local-midnight boundaries, repeated-hour offset choices, and Unicode scalar title validation are centralized. DST and device-zone changes were manually inspected.
- Delivery: Android debug/release compilation, iOS Release compilation, both JavaScript exports, typecheck, lint, dependency compatibility, and Expo Doctor passed. Run instructions, environment example, EAS profiles, and local artifacts are present.

## Device and distribution limits

No physical phone is attached to this environment. Physical-device installation, gesture feel, haptics, and accessibility require device acceptance; simulator results do not establish those checks. iPhone distribution still requires the user's Apple signing setup. These unverified device conditions are disclosed as required by the plan.

No cloud build or store submission has been performed. No automated tests were added.

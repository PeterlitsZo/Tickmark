# Refinement observations

All captures use the isolated local API on port 8790. Files prefixed `ios-` are native iOS Release simulator observations. Files prefixed `android-release-`, plus `crossday-`, are native Android Release emulator observations. Other captures use Android API 37.1 ARM64 **Expo Go** and Gboard; its floating gear is a development overlay. None establishes physical Xiaomi behavior or every accessibility configuration. The chronological ledger identifies which source revision each observation covers.

| Capture | Observation |
| --- | --- |
| `drag-before-background.png`, `drag-after-background.png` | Active movement preview is canceled on Home/background; request logging showed zero writes and an API read retained original timestamps. |
| `dense-entry-chooser.png`, `compact-editor.png` | A short overlapping entry opens a chooser near the tap; selecting Review notes opens that entry's editor without automatically showing the keyboard. |
| `keyboard-font-130.png` | At Android font scale 1.3, Gboard and the card meet without an exposed timeline band; title, time rows, and Save remain visible. Font scale was restored to 1.0. |
| `put-response-loss-reconciled.png` | After dropping a successful local PUT response, reading both ranges confirmed the saved time; no second PUT was sent. |
| `put-uncertain.png` | Failed PUT and reads preserve the requested preview and both before/requested times; the entry is locked. |
| `put-rechecked.png` | Restored connectivity does not falsely confirm a write when the server still has the original values. |
| `put-retry-confirm.png`, `put-retry-saved.png` | Explicit retry warns about overwriting other-device changes, then one additional PUT saves and clears the pending state. |
| `android-go-before-404.png`, `android-go-after-404.png` | An externally deleted local fixture disappears after its cached block receives a real PUT 404. |
| `crossday-selected.png`, `crossday-moved.png`, `crossday-old-date.png` | Only the true end handle appears on the continuation fragment. Moving it preserves the complete one-hour duration and removes its old-day fragment. |
| `ios-keyboard-ten-cycles.png` | Ten native iOS focus/close/reopen cycles retain a visible Save button and no exposed background band above the keyboard. |
| `android-release-offset-summary.png` | Ambiguous start and end times show their different UTC offsets beneath the time text. |
| `ios-release-resize-start.png`, `ios-release-resize-end.png` | Final native iOS handle drags independently change start/end and preserve the opposite endpoint. |
| `ios-release-edge-resize.png` | Holding the end handle at the lower viewport edge auto-scrolls and clamps the end at midnight. |
| `android-release-offline.png`, `android-release-offline-editor.png` | Cached entries remain readable; offline dragging makes no change and the editor disables Save/Delete. |

See `../../../REFINEMENT.md` for timestamps, request counts, remaining acceptance, and implementation details. Network observations used temporary in-memory fetch overrides limited to the isolated local origin; all overrides were removed after observation. No automated tests were added.

## iOS native observations

The `ios-` captures use the current native Release simulator build, with bundled JavaScript pointing to isolated API 8790. `ios-launcher.png` shows the selected icon under the OS mask; `ios-release-editor.png` and `ios-release-keyboard.png` show the existing-entry card without and with the keyboard. `ios-release-splash.png` captures the configured mark after a clean install. `ios-release-launch.mp4` includes the OS opening animation and transition into the calendar; dark frames during opening remain to be investigated. These captures are not Expo Go or physical iPhone evidence.

## Android native Release observations

Files prefixed `android-release-` are independent native Release captures against local API 8790. The ten-cycle montage records Gboard reopen behavior; editor/keyboard captures show the default compact layout. Time-minute and time-cancel captures show a one-minute selection and cancellation. The drag video and preview/saved frames record a native move preserving duration. These are emulator observations, not Xiaomi-device acceptance.


## Final delivery review

See [current acceptance](../../../VALIDATION.md) for the seven-request summary and device limitations, and [before/after](comparison/README.md) for the calendar/editor comparison.

- `android-release-resize-seconds.png`: minimum resize with a fixed endpoint containing seconds; exact API values are in the ledger.
- `android-release-backdrop-guard.png`, `ios-release-backdrop-guard.png`: final native dirty-draft protection on backdrop presses.
- `android-release-{close,back,pan}-guard.png`: other Android close paths.
- `android-release-crud-edit.png`, `android-release-delete-confirm.png`, `android-release-deleted.png`: isolated editor lifecycle.
- `android-release-entries-redirect.png`: legacy route returns to the calendar.
- `android-release-launcher.png`: Android adaptive mask review.
- `ios-release-final-launch.mp4`, `ios-release-final-splash.png`: clean-install final iOS launch, including the disclosed pre-splash black opening transition.

Production-origin comparison captures show an empty day and unsaved draft; no production records were created, edited or deleted. All interaction writes used the isolated API.

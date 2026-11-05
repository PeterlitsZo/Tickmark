# Mobile workspace design notes

These are deterministic SVG UI proposals, authored as vector assets. Open `index.html` for the gallery or an individual SVG for a full-size screen. No image generation model, external fonts, remote assets or live API is required. The illustrations are not implementation screenshots; native gesture, keyboard and accessibility behavior still requires device validation.

## Visual system

Canvas #FBFBFA; surface #FFFFFF; text #292D29; muted text #747970; dividers #E8EAE4; primary #425D48. Retain the current native system font. Use tabular numbers for times. Use 22-point page margins, 8–12-point control radii and 44–48-point primary touch targets. Color chips supplement readable category names. Selected blocks require a separate outline and handles. Final implementation must check contrast, Dynamic Type and platform accessibility settings.

## Screen contracts

- **01 Calendar:** Add creates a draft. The month opens date navigation. Today returns to the current local day. The overflow exposes Refresh and Categories. Calendar and Todos are separate bottom tabs with icons and labels. Calendar is the default tab. Keep existing timeline creation, movement and resizing gestures.
- **02 Todos:** The heading and add row remain fixed while rows scroll. Tap a checkbox to complete; tap a title to edit inline; open the row menu to delete with confirmation. Completed expands below the open list and supports reopening. Switching tabs retains drafts, independent scroll offsets and completed-section disclosure state. The list spans all dates; the design shows completed items expanded.
- **03 Entry editor:** Category opens an in-sheet selection view with current selection and named options. Manage opens the categories route and returns to the original draft. Start/end reuse the existing date/time picker and explicit offset choices. Save sits above the keyboard. The sheet covers the tab bar; save or close it before switching tabs. Dirty dismissal requires confirmation. Editing an existing entry does not update the last-created-category preference.
- **04 Categories:** The expanded Work section is an example of editing one row; the reference warning illustrates the server rejecting deletion. Colors are semantic enum choices, not arbitrary values. Duplicate names display IDs. Keep rename/color edits usable after a delete rejection. An unknown future color is shown neutrally and preserved when only the name changes.
- **05 Recovery:** This proposes the recovery content, not a mandatory additional route. Integrate it into the current editor/status host and retain the draft. Only allow explicit retry after checking; explain create duplication and edit overwrite risk. A matching create is a candidate requiring user selection, never proof of success. Navigating back retains pending operation tracking.

## Other required states

| State | Behavior |
| --- | --- |
| Initial loading | Skeletons; do not report zero todos or zero categories prematurely. |
| Empty todos | “Nothing waiting. Add a todo when you need one.” Keep input visible. |
| Empty categories | “Default will be created when you save.” Only after successful empty read. |
| Category read failure | Retain entry draft and cached timeline. Retry the category read; block invalid saves. |
| Missing category | Neutral block label; explicit replacement in editor without dropping the draft. |
| Offline | Keep cached content, display offline status and disable writes. No offline queue. |
| Pending write | Disable the affected operation; avoid duplicate taps; preserve navigation context. |
| Small screen / keyboard | Scroll form body, pin actions above keyboard, expand sheet as needed. |
| Long names / dense entries | Truncate visually, retain full accessible text and the existing dense-entry chooser. |
| Larger type | Let rows grow; permit near-full-screen editing instead of compressing controls. |

Use Expo Router for the two-tab layout, with categories in the parent Stack. Keep query state, drafts and pending-write tracking above the tab navigator so state retention does not depend on screens remaining mounted. Preserve existing calendar links and the legacy Entries redirect. Switching tabs does not save or discard a todo draft, reset the selected date or scroll either page to the top. Hide the tab bar while the Todos keyboard is visible; restore it on dismissal. The entry editor covers bottom navigation, and category management returns to its originating editor or tab. Recovery retains request tracking across navigation. No analytics, task-to-entry linkage or automatic scheduling is proposed.

Each SVG also has a matching 780 × 1688 PNG rendered with headless Chrome. These are rendered design assets, not application screenshots. All five screens were visually reviewed. The repository currently ignores `plans/`; delivery files exist locally without being staged.

# Tickmark icon

The user selected **A / Timeline**: three time ticks beside one long and one short entry. The colors match the calendar's charcoal, sage, and warm white. Direction B / Interval is retained as an editable alternative, not used by the app.

`timeline.svg` is the approved source, expressed on a 1024-square adaptive-icon canvas. The artwork fits inside the central safe circle. The iOS/store icon scales the mark by 1.36 around its center; Android uses the unscaled transparent foreground to preserve launcher masking margins. Do not copy the enlarged iOS artwork into the adaptive foreground.

Generated resources:

- `../icon.png`: 1024px opaque RGB icon; corners are left to the OS.
- `../android-icon-foreground.png`: transparent color foreground.
- `../android-icon-background.png`: opaque warm-white background.
- `../android-icon-monochrome.png`: transparent single-color silhouette for themed icons.
- `../splash-icon.png`: transparent enlarged mark; the splash plugin supplies the background.
- `comparison.png`, `timeline-{24,48,1024}.png`, and the corresponding interval previews: visual review sizes.

To regenerate from the vectors, install librsvg and ImageMagick as local asset tools, then run from `mobile/`:

```sh
python3 scripts/generate-icons.py
npx expo prebuild --no-install
```

These tools are not app dependencies. The generator does not edit native projects; Expo's config plugins generate launcher and splash resources from `app.json`. Build and install a release binary to check the actual OS mask, themed icons, and startup transition. Expo Go is insufficient evidence for the final splash screen.

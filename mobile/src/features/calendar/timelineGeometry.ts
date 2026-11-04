import { controls } from "../../theme/metrics";
import type { Entry, TimeRange } from "../../api/entries";

export const PIXELS_PER_MINUTE = 2.4;
export const TIME_GUTTER = 64;
export const TIMELINE_PADDING = 20;
export const SNAP_SECONDS = 300;
export const LONG_PRESS_MS = 300;
export type DragMode =
  | "creating"
  | "moving"
  | "resizing-start"
  | "resizing-end";

export function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.max(min, Math.min(max, value));
}

export function timeAt(y: number, scrollY: number, range: TimeRange) {
  "worklet";
  return clamp(
    range.from + ((y + scrollY - TIMELINE_PADDING) / PIXELS_PER_MINUTE) * 60,
    range.from,
    range.to,
  );
}

export function dragTimes(
  mode: DragMode,
  original: { start_time: number; end_time: number },
  delta: number,
  range: TimeRange,
) {
  "worklet";
  const snappedDelta = Math.trunc(delta / SNAP_SECONDS) * SNAP_SECONDS;
  if (mode === "moving") {
    // Keep the visible fragment on this day while preserving the entire entry.
    const min = range.from - Math.max(range.from, original.start_time);
    const max =
      range.to -
      (original.start_time === original.end_time ? 1 : 0) -
      Math.min(range.to, original.end_time);
    const shift = clamp(
      snappedDelta,
      Math.ceil(min / SNAP_SECONDS) * SNAP_SECONDS,
      Math.floor(max / SNAP_SECONDS) * SNAP_SECONDS,
    );
    return {
      start_time: original.start_time + shift,
      end_time: original.end_time + shift,
    };
  }
  if (mode === "resizing-start") {
    const latestStart =
      Math.floor((original.end_time - SNAP_SECONDS) / SNAP_SECONDS) * SNAP_SECONDS;
    if (latestStart < range.from) return original;
    const start = clamp(
      Math.round((original.start_time + delta) / SNAP_SECONDS) * SNAP_SECONDS,
      range.from,
      Math.min(range.to, latestStart),
    );
    return { start_time: start, end_time: original.end_time };
  }
  const earliestEnd =
    Math.ceil((original.start_time + SNAP_SECONDS) / SNAP_SECONDS) * SNAP_SECONDS;
  if (earliestEnd > range.to) return original;
  const end = clamp(
    Math.round((original.end_time + delta) / SNAP_SECONDS) * SNAP_SECONDS,
    Math.max(range.from, earliestEnd),
    range.to,
  );
  return { start_time: original.start_time, end_time: end };
}

export function blockFrame(item: PositionedEntry, width: number) {
  return {
    left:
      TIME_GUTTER + (item.column / item.columns) * (width - TIME_GUTTER - 16),
    width: Math.max(8, (width - TIME_GUTTER - 16) / item.columns - 4),
    top: item.top + TIMELINE_PADDING,
    height: item.height,
  };
}

export type HitRect = ReturnType<typeof blockFrame> & { entry: Entry };
export function resizeTargets(
  rect: HitRect,
  viewportWidth: number,
  contentHeight: number,
) {
  "worklet";
  const maxLeft = Math.max(TIME_GUTTER, viewportWidth - controls.touchTarget);
  const maxTop = Math.max(0, contentHeight - controls.touchTarget);
  const start = {
    left: clamp(rect.left, TIME_GUTTER, maxLeft),
    top: clamp(rect.top - controls.touchTarget / 2, 0, maxTop),
  };
  const end = {
    left: clamp(
      rect.left + rect.width - controls.touchTarget,
      TIME_GUTTER,
      maxLeft,
    ),
    top: clamp(
      rect.top + rect.height - controls.touchTarget / 2,
      0,
      maxTop,
    ),
  };
  if (
    Math.abs(start.left - end.left) < controls.touchTarget &&
    end.top - start.top < controls.touchTarget
  ) {
    start.top = clamp(end.top - controls.touchTarget, 0, maxTop - controls.touchTarget);
    end.top = start.top + controls.touchTarget;
  }
  return { start, end };
}
export function hitEntry(rects: HitRect[], x: number, y: number) {
  "worklet";
  return rects.find(
    (rect) =>
      x >= rect.left &&
      x <= rect.left + rect.width &&
      y >= rect.top - 8 &&
      y <= rect.top + rect.height + 8,
  );
}

export type PositionedEntry = {
  entry: Entry;
  top: number;
  height: number;
  column: number;
  columns: number;
};
export function layoutEntries(
  entries: Entry[],
  range: TimeRange,
  pixelsPerMinute: number,
): PositionedEntry[] {
  const positioned = entries
    .map((entry) => {
      const top = Math.max(
        0,
        ((entry.start_time - range.from) / 60) * pixelsPerMinute,
      );
      const trueHeight =
        ((Math.min(entry.end_time, range.to) -
          Math.max(entry.start_time, range.from)) /
          60) *
        pixelsPerMinute;
      return {
        entry,
        top,
        height: trueHeight,
        column: 0,
        columns: 1,
      };
    })
    .sort(
      (a, b) =>
        a.top - b.top ||
        a.entry.id.length - b.entry.id.length ||
        a.entry.id.localeCompare(b.entry.id),
    );
  let group: PositionedEntry[] = [];
  let ends: number[] = [];
  let groupEnd = -1;
  const finish = () =>
    group.forEach((item) => {
      item.columns = ends.length;
    });
  for (const item of positioned) {
    const start = Math.max(range.from, item.entry.start_time);
    const end = Math.min(range.to, item.entry.end_time);
    if (start >= groupEnd) {
      finish();
      group = [];
      ends = [];
      groupEnd = -1;
    }
    let column = ends.findIndex((columnEnd) => columnEnd <= start);
    if (column === -1) column = ends.length;
    item.column = column;
    ends[column] = end;
    groupEnd = Math.max(groupEnd, ends[column]);
    group.push(item);
  }
  finish();
  return positioned;
}

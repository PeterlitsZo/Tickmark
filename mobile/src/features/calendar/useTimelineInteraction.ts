import * as Haptics from "expo-haptics";
import { useCallback, useLayoutEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type AnimatedRef,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { controls } from "../../theme/metrics";
import type { Entry, TimeRange } from "../../api/entries";
import {
  duration,
  entryTime,
  offsetLabel,
  otherOccurrences,
} from "../../lib/time";
import {
  blockFrame,
  clamp,
  dragTimes,
  hitEntry,
  resizeTargets,
  LONG_PRESS_MS,
  PIXELS_PER_MINUTE,
  SNAP_SECONDS,
  timeAt,
  TIMELINE_PADDING,
  TIME_GUTTER,
  type DragMode,
  type PositionedEntry,
} from "./timelineGeometry";
import { useEdgeAutoScroll } from "./useEdgeAutoScroll";

type Interaction =
  | { kind: "idle" }
  | { kind: "selected"; entry: Entry }
  | { kind: DragMode; entry: Entry | null };
type Options = {
  range: TimeRange;
  positioned: PositionedEntry[];
  width: number;
  disabled: boolean;
  online: boolean;
  pendingIds: string[];
  scrollRef: AnimatedRef<Animated.ScrollView>;
  scrollY: SharedValue<number>;
  viewportHeight: SharedValue<number>;
  create: (start: number, end: number) => void;
  edit: (entry: Entry) => void;
  commit: (entry: Entry, start: number, end: number) => void;
  notify: (message: string) => void;
  choose: (entries: Entry[], viewportY: number) => void;
};

export function useTimelineInteraction(options: Options) {
  const {
    range,
    positioned,
    width,
    disabled,
    online,
    pendingIds,
    scrollRef,
    scrollY,
    viewportHeight,
  } = options;
  const [state, setState] = useState<Interaction>({ kind: "idle" });
  const [frozen, setFrozen] = useState<PositionedEntry[] | null>(null);
  const [label, setLabel] = useState("");
  const active = useSharedValue(false);
  const generation = useSharedValue(0);
  const gestureGeneration = useSharedValue(0);
  const mounted = useSharedValue(false);
  const mode = useSharedValue<DragMode>("creating");
  const original = useSharedValue<Entry | null>(null);
  const start = useSharedValue(0);
  const end = useSharedValue(0);
  const anchorTime = useSharedValue(0);
  const anchorY = useSharedValue(0);
  const anchorScroll = useSharedValue(0);
  const pointerY = useSharedValue(0);
  const moved = useSharedValue(false);
  const labelHeight = useSharedValue(44);
  const handleTouch = useSharedValue<{
    kind: DragMode;
    entry: Entry;
    x: number;
    y: number;
  } | null>(null);
  const selected = state.kind === "idle" ? null : state.entry;
  const rects = (frozen ?? positioned).map((item) => ({
    ...blockFrame(item, width),
    entry: item.entry,
  }));
  const selectedRect = rects.find((rect) => rect.entry.id === selected?.id);
  const left = useSharedValue(TIME_GUTTER);
  const blockWidth = useSharedValue(100);

  const cancel = useCallback(() => {
    generation.set(generation.get() + 1);
    active.set(false);
    setState({ kind: "idle" });
    setFrozen(null);
  }, [active, generation]);
  const context = `${disabled}:${online}:${range.from}:${range.to}`;
  const [previousContext, setPreviousContext] = useState(context);
  if (context !== previousContext) {
    setPreviousContext(context);
    setState({ kind: "idle" });
    setFrozen(null);
  }
  useLayoutEffect(() => {
    generation.set(generation.get() + 1);
    active.set(false);
  }, [context, active, generation]);
  useLayoutEffect(() => {
    mounted.set(true);
    const subscription = AppState.addEventListener("change", (status) => {
      if (status !== "active") cancel();
    });
    const blurSubscription = AppState.addEventListener("blur", cancel);
    return () => {
      mounted.set(false);
      generation.set(generation.get() + 1);
      active.set(false);
      subscription.remove();
      blurSubscription.remove();
    };
  }, [active, cancel, generation, mounted]);

  function accepts(token: number, writing = false) {
    return (
      mounted.get() &&
      token === generation.get() &&
      AppState.currentState === "active" &&
      !disabled &&
      (!writing || online)
    );
  }
  function begin(token: number, kind: DragMode, entry: Entry | null) {
    if (!accepts(token, true)) return;
    setState({ kind, entry });
    setFrozen(positioned);
    void Haptics.selectionAsync().catch(() => {});
  }
  function finish(
    token: number,
    kind: DragMode,
    entry: Entry | null,
    first: number,
    last: number,
    success: boolean,
  ) {
    if (!accepts(token, true)) return;
    setFrozen(null);
    if (!success) {
      setState({ kind: "idle" });
      return;
    }
    if (kind === "creating") {
      setState({ kind: "idle" });
      options.create(first, last);
    } else if (entry) {
      setState({ kind: "selected", entry });
      if (first !== entry.start_time || last !== entry.end_time) {
        setState({ kind: "idle" });
        options.commit(entry, first, last);
      }
    }
  }
  function updateLabel(token: number, first: number, last: number, snapped: boolean) {
    if (!accepts(token, true)) return;
    if (snapped) void Haptics.selectionAsync().catch(() => {});
    const repeated =
      otherOccurrences(first).length || otherOccurrences(last).length;
    setLabel(
      `${entryTime({ id: "preview", category_id: "1", title: "", start_time: first, end_time: last })} · ${duration(last - first)}${repeated ? ` · ${offsetLabel(first)} / ${offsetLabel(last)}` : ""}`,
    );
  }
  useAnimatedReaction(
    () => (active.value ? `${start.value}:${end.value}` : ""),
    (value, previous) => {
      if (value && value !== previous)
        scheduleOnRN(
          updateLabel,
          gestureGeneration.value,
          start.value,
          end.value,
          !!previous,
        );
    },
  );

  const update = () => {
    "worklet";
    const deltaPixels =
      pointerY.value - anchorY.value + scrollY.value - anchorScroll.value;
    if (Math.abs(deltaPixels) > 3) moved.set(true);
    if (!moved.value) return;
    if (mode.value === "creating") {
      const current = clamp(
        Math.round(
          timeAt(pointerY.value, scrollY.value, range) / SNAP_SECONDS,
        ) * SNAP_SECONDS,
        range.from,
        range.to,
      );
      const first = Math.min(anchorTime.value, current);
      start.set(Math.min(first, range.to - SNAP_SECONDS));
      end.set(
        Math.max(
          Math.max(anchorTime.value, current),
          start.value + SNAP_SECONDS,
        ),
      );
    } else if (original.value) {
      const result = dragTimes(
        mode.value,
        original.value,
        (deltaPixels / PIXELS_PER_MINUTE) * 60,
        range,
      );
      start.set(result.start_time);
      end.set(result.end_time);
    }
  };
  const activate = (
    kind: DragMode,
    entry: Entry | null,
    x: number,
    y: number,
  ) => {
    "worklet";
    if (!online || (entry && pendingIds.includes(entry.id))) {
      scheduleOnRN(
        options.notify,
        !online
          ? "Reconnect before changing times."
          : "This entry is awaiting confirmation.",
      );
      return;
    }
    gestureGeneration.set(generation.value);
    mode.set(kind);
    original.set(entry);
    active.set(true);
    moved.set(false);
    pointerY.set(y);
    anchorY.set(y);
    anchorScroll.set(scrollY.value);
    const initial = clamp(
      Math.round(timeAt(y, scrollY.value, range) / SNAP_SECONDS) * SNAP_SECONDS,
      range.from,
      range.to - SNAP_SECONDS,
    );
    anchorTime.set(initial);
    start.set(entry?.start_time ?? initial);
    end.set(entry?.end_time ?? Math.min(range.to, initial + 900));
    const rect = entry
      ? rects.find((item) => item.entry.id === entry.id)
      : null;
    left.set(rect?.left ?? TIME_GUTTER);
    blockWidth.set(rect?.width ?? Math.max(8, width - TIME_GUTTER - 20));
    scheduleOnRN(begin, gestureGeneration.value, kind, entry);
  };
  const complete = (success: boolean, resizing: boolean) => {
    "worklet";
    if (!active.value) return;
    const activeIsResize =
      mode.value === "resizing-start" || mode.value === "resizing-end";
    // A losing recognizer also finalizes; it must not cancel the winner.
    if (activeIsResize !== resizing) return;
    active.set(false);
    scheduleOnRN(
      finish,
      gestureGeneration.value,
      mode.value,
      original.value,
      start.value,
      end.value,
      success,
    );
  };
  const handleAt = (x: number, y: number): DragMode | null => {
    "worklet";
    if (!selectedRect) return null;
    const rect = selectedRect;
    const targets = resizeTargets(
      rect, width,
      ((range.to - range.from) / 60) * PIXELS_PER_MINUTE + TIMELINE_PADDING * 2,
    );
    const contains = (target: { left: number; top: number }) =>
      x >= target.left &&
      x <= target.left + controls.touchTarget &&
      y >= target.top &&
      y <= target.top + controls.touchTarget;
    if (rect.entry.start_time >= range.from && contains(targets.start))
      return "resizing-start";
    if (rect.entry.end_time <= range.to && contains(targets.end))
      return "resizing-end";
    return null;
  };
  const nativeScroll = Gesture.Native();
  const handles = Gesture.Pan()
    .manualActivation(Platform.OS === "ios")
    .minDistance(0)
    .maxPointers(1)
    .enabled(!disabled)
    .blocksExternalGesture(nativeScroll)
    .onTouchesDown((event, manager) => {
      const touch = event.allTouches[0];
      const kind = touch && handleAt(touch.x, touch.y + scrollY.value);
      if (touch && kind && selectedRect) {
        // Preserve the initial hit and position: native iOS pan activation
        // can arrive after the finger has already moved off the handle.
        handleTouch.set({ kind, entry: selectedRect.entry, x: touch.x, y: touch.y });
        if (Platform.OS === "ios") manager.activate();
      } else {
        handleTouch.set(null);
        manager.fail();
      }
    })
    .onStart((event) => {
      const initial = handleTouch.value;
      if (initial) {
        activate(initial.kind, initial.entry, initial.x, initial.y);
        pointerY.set(event.y);
        update();
      }
    })
    .onUpdate((event) => {
      if (active.value) {
        pointerY.set(event.y);
        update();
      }
    })
    .onEnd((_event, success) => complete(success, true))
    .onFinalize(() => complete(false, true));
  const hold = Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MS)
    .maxPointers(1)
    .enabled(!disabled)
    .blocksExternalGesture(nativeScroll)
    .onTouchesDown((event, manager) => {
      if (!event.allTouches[0] || event.allTouches[0].x < TIME_GUTTER)
        manager.fail();
    })
    .onStart((event) => {
      const rect = hitEntry(rects, event.x, event.y + scrollY.value);
      activate(
        rect ? "moving" : "creating",
        rect?.entry ?? null,
        event.x,
        event.y,
      );
    })
    .onUpdate((event) => {
      if (active.value) {
        pointerY.set(event.y);
        update();
      }
    })
    .onEnd((_event, success) => complete(success, false))
    .onFinalize(() => complete(false, false));
  function tap(token: number, x: number, y: number, viewportY: number) {
    if (!accepts(token)) return;
    const candidates = rects.filter(
      (rect) => y >= rect.top - 10 && y <= rect.top + rect.height + 10,
    );
    const hit = hitEntry(rects, x, y);
    setState({ kind: "idle" });
    if (
      candidates.length > 1 &&
      (!hit || hit.width < controls.touchTarget || hit.height < 32)
    )
      options.choose(
        candidates.map((item) => item.entry),
        viewportY,
      );
    else if (hit) options.edit(hit.entry);
  }
  const tapping = Gesture.Tap()
    .enabled(!disabled)
    // Android has no default movement limit; a swipe must fail this tap.
    .maxDistance(10)
    .onEnd((event, success) => {
      if (success)
        scheduleOnRN(
          tap,
          generation.value,
          event.x,
          event.y + scrollY.value,
          event.y,
        );
    });
  useEdgeAutoScroll({
    active,
    pointerY,
    viewportHeight,
    scrollY,
    contentHeight:
      ((range.to - range.from) / 60) * PIXELS_PER_MINUTE + TIMELINE_PADDING * 2,
    scrollRef,
    onScroll: update,
  });
  const previewStyle = useAnimatedStyle(() => ({
    opacity: active.value ? 1 : 0,
    top:
      ((Math.max(range.from, start.value) - range.from) / 60) *
        PIXELS_PER_MINUTE +
      TIMELINE_PADDING,
    height:
      ((Math.min(range.to, end.value) - Math.max(range.from, start.value)) /
        60) *
      PIXELS_PER_MINUTE,
    left: left.value,
    width: blockWidth.value,
  }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: active.value ? 1 : 0,
    top: clamp(pointerY.value + 28, 8, Math.max(8, viewportHeight.value - labelHeight.value - 8)),
  }));
  return {
    labelHeight,
    labelStyle,
    gesture: Gesture.Exclusive(handles, hold, tapping),
    nativeScroll,
    state,
    selectedRect,
    frozen,
    label,
    previewStyle,
    locked: state.kind !== "idle" && state.kind !== "selected",
  };
}

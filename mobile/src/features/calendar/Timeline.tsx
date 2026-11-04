import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import { X } from "lucide-react-native";
import type { Entry } from "../../api/entries";
import { IconButton } from "../../components/IconButton";
import { dayKey, entryTime, hourTicks, seconds } from "../../lib/time";
import { colors } from "../../theme";
import { useEntries } from "../entries/EntriesProvider";
import {
  clamp,
  layoutEntries,
  PIXELS_PER_MINUTE as PPM,
  TIME_GUTTER as GUTTER,
  TIMELINE_PADDING as PAD,
} from "./timelineGeometry";
import { useTimelineInteraction } from "./useTimelineInteraction";
import { TimeBlock } from "./TimeBlock";
import { ResizeHandles } from "./ResizeHandles";

export function Timeline() {
  const {
    range,
    query,
    selectedDay,
    create,
    edit,
    draft,
    online,
    mutations,
    setNotice,
  } = useEntries();
  const height = ((range.to - range.from) / 60) * PPM;
  const [now, setNow] = useState(seconds(new Date()));
  const [width, setWidth] = useState(0);
  const [choices, setChoices] = useState<{
    entries: Entry[];
    y: number;
  } | null>(null);
  const [viewportSize, setViewportSize] = useState(0);
  const [choiceHeight, setChoiceHeight] = useState(308);
  const didPosition = useRef(false);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const positioned = useMemo(() => {
    const entries = new Map(
      (query.data?.items ?? []).map((entry) => [entry.id, entry]),
    );
    for (const operation of Object.values(mutations.pending)) {
      const target = { ...operation.target, id: operation.original.id };
      const intersects =
        target.start_time === target.end_time
          ? target.start_time >= range.from && target.start_time < range.to
          : target.start_time < range.to && target.end_time > range.from;
      if (intersects) entries.set(target.id, target);
      else entries.delete(target.id);
    }
    return layoutEntries([...entries.values()], range, PPM);
  }, [query.data?.items, mutations.pending, range]);
  const ticks = useMemo(() => hourTicks(range), [range]);
  useEffect(() => {
    const interval = setInterval(() => setNow(seconds(new Date())), 30000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setNow(seconds(new Date()));
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);
  const interaction = useTimelineInteraction({
    range,
    positioned,
    width,
    disabled: !!draft || !!choices,
    online,
    pendingIds: Object.keys(mutations.pending),
    scrollRef,
    scrollY,
    viewportHeight,
    create,
    edit,
    notify: setNotice,
    choose: (entries, y) => setChoices({ entries, y }),
    commit: (entry, start_time, end_time) => {
      void mutations
        .replace(entry, { title: entry.title, start_time, end_time })
        .catch((error: unknown) => {
          setNotice(
            error instanceof Error
              ? error.message
              : "Could not save this change.",
          );
        });
    },
  });
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });
  const isToday = selectedDay === dayKey(new Date());
  const draftStart = draft ? Math.max(range.from, draft.input.start_time) : 0;
  const draftEnd = draft ? Math.min(range.to, draft.input.end_time) : 0;
  return (
    <GestureDetector gesture={interaction.gesture}>
      <View
        style={styles.viewport}
        onLayout={(event) => {
          const layout = event.nativeEvent.layout;
          setWidth(layout.width);
          setViewportSize(layout.height);
          viewportHeight.set(layout.height);
          if (!didPosition.current && layout.height > 0) {
            didPosition.current = true;
            const minute = isToday
              ? (seconds(new Date()) - range.from) / 60 - 120
              : 8 * 60;
            const offset = Math.max(
              0,
              Math.min(height + PAD * 2 - layout.height, minute * PPM),
            );
            requestAnimationFrame(() => {
              scrollRef.current?.scrollTo({ y: offset, animated: false });
            });
          }
        }}
      >
        <GestureDetector gesture={interaction.nativeScroll}>
          <Animated.ScrollView
            ref={scrollRef}
            onScroll={onScroll}
            scrollEventThrottle={16}
            scrollEnabled={!interaction.locked && !draft}
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ height: height + PAD * 2 }}>
              {ticks.map((tick) => (
                <View
                  pointerEvents="none"
                  key={tick.timestamp}
                  style={[
                    styles.tick,
                    { top: ((tick.timestamp - range.from) / 60) * PPM + PAD },
                  ]}
                >
                  <View style={styles.hour}>
                    <Text style={styles.hourText}>{tick.label}</Text>
                    {tick.repeated && (
                      <Text style={styles.offset}>{tick.offset}</Text>
                    )}
                  </View>
                  <View style={styles.rule} />
                </View>
              ))}
              {ticks.map((tick) => (
                <View
                  key={`half-${tick.timestamp}`}
                  pointerEvents="none"
                  style={[
                    styles.halfRule,
                    {
                      top:
                        ((tick.timestamp - range.from) / 60) * PPM +
                        PAD +
                        30 * PPM,
                    },
                  ]}
                />
              ))}
              {(interaction.frozen ?? positioned).map((item) => (
                <TimeBlock
                  key={item.entry.id}
                  item={item}
                  range={range}
                  width={width}
                  dimmed={
                    interaction.locked &&
                    interaction.state.kind !== "idle" &&
                    interaction.state.entry?.id === item.entry.id
                  }
                  pending={!!mutations.pending[item.entry.id]}
                  onEdit={() => edit(item.entry)}
                />
              ))}
              {interaction.state.kind === "selected" &&
                interaction.selectedRect && (
                  <ResizeHandles
                    width={width}
                    rect={interaction.selectedRect}
                    range={range}
                  />
                )}
              {isToday && now >= range.from && now < range.to && (
                <View
                  pointerEvents="none"
                  style={[
                    styles.now,
                    { top: ((now - range.from) / 60) * PPM + PAD },
                  ]}
                >
                  <View style={styles.nowDot} />
                  <View style={styles.nowLine} />
                </View>
              )}
              <Animated.View
                pointerEvents="none"
                style={[styles.selection, interaction.previewStyle]}
              />
              {draft && !draft.entry && draftEnd > draftStart && (
                <View
                  pointerEvents="none"
                  style={[
                    styles.selection,
                    {
                      top: ((draftStart - range.from) / 60) * PPM + PAD,
                      height: ((draftEnd - draftStart) / 60) * PPM,
                    },
                  ]}
                >
                  <Text style={styles.selectionText}>New entry</Text>
                </View>
              )}
            </View>
          </Animated.ScrollView>
        </GestureDetector>
        <Animated.View
          pointerEvents="none"
          onLayout={(event) => interaction.labelHeight.set(event.nativeEvent.layout.height)}
          style={[styles.dragLabel, interaction.labelStyle]}
        >
          <Text style={styles.dragLabelText}>{interaction.label}</Text>
        </Animated.View>
        {!!choices && (
          <View
            accessibilityViewIsModal
            onLayout={(event) =>
              setChoiceHeight(event.nativeEvent.layout.height)
            }
            style={[
              styles.choiceOverlay,
              {
                top: clamp(
                  choices.y - 24,
                  12,
                  Math.max(12, viewportSize - choiceHeight - 12),
                ),
              },
            ]}
          >
            <View style={styles.choiceHeader}>
              <Text style={styles.choiceHeading}>Choose an entry</Text>
              <IconButton
                icon={X}
                label="Close entry choices"
                onPress={() => setChoices(null)}
              />
            </View>
            <ScrollView
              style={{
                maxHeight: Math.max(44, Math.min(240, viewportSize - 100)),
              }}
            >
              {choices.entries.map((entry) => (
                <Pressable
                  key={entry.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setChoices(null);
                    edit(entry);
                  }}
                  style={styles.choice}
                >
                  <Text numberOfLines={2} style={styles.choiceHeading}>
                    {entry.title}
                  </Text>
                  <Text style={styles.hourText}>{entryTime(entry)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </GestureDetector>
  );
}
const styles = StyleSheet.create({
  dragLabel: {
    position: "absolute",
    left: GUTTER,
    right: 12,
    padding: 8,
    borderRadius: 5,
    backgroundColor: colors.ink,
  },
  dragLabelText: { color: colors.surface, fontSize: 12, fontWeight: "600" },
  choiceOverlay: {
    position: "absolute",
    left: 20,
    right: 20,
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  choiceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  choiceHeading: { fontSize: 14, fontWeight: "600", color: colors.ink },
  choice: {
    minHeight: 52,
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  viewport: { flex: 1, backgroundColor: colors.canvas },
  tick: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  hour: { width: GUTTER, alignItems: "center", marginTop: -8 },
  hourText: {
    fontSize: 10,
    color: colors.muted,
    fontVariant: ["tabular-nums"],
  },
  offset: { fontSize: 8, color: colors.muted, marginTop: 2 },
  rule: { height: 1, backgroundColor: colors.line, flex: 1, marginTop: -1 },
  halfRule: {
    position: "absolute",
    left: GUTTER,
    right: 0,
    height: 1,
    backgroundColor: "#F1F2EE",
  },
  now: {
    position: "absolute",
    left: GUTTER - 4,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  nowDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.now,
    marginTop: -3,
  },
  nowLine: { flex: 1, height: 1, backgroundColor: colors.now, marginTop: -3 },
  selection: {
    position: "absolute",
    left: GUTTER,
    backgroundColor: "#D9E5D4DD",
    borderWidth: 1,
    borderColor: colors.accent,
    borderStyle: "dashed",
    borderRadius: 5,
    overflow: "hidden",
  },
  selectionText: { color: colors.accent, fontSize: 11, fontWeight: "600" },
});

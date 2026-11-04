import { StyleSheet, Text, View } from "react-native";
import type { TimeRange } from "../../api/entries";
import { entryTime } from "../../lib/time";
import { colors, controls, radii, typeSize } from "../../theme";
import { PIXELS_PER_MINUTE, TIMELINE_PADDING, TIME_GUTTER, resizeTargets, type HitRect } from "./timelineGeometry";

export function ResizeHandles({
  rect,
  range,
  width,
}: {
  rect: HitRect;
  range: TimeRange;
  width: number;
}) {
  const targets = resizeTargets(
    rect, width,
    ((range.to - range.from) / 60) * PIXELS_PER_MINUTE + TIMELINE_PADDING * 2,
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          styles.outline,
          {
            top: rect.top,
            left: rect.left,
            height: rect.height,
            width: rect.width,
          },
        ]}
      />
      <Text
        style={[
          styles.label,
          { top: Math.max(0, rect.top - 25), left: TIME_GUTTER, right: 12 },
        ]}
      >
        {entryTime(rect.entry)}
      </Text>
      {rect.entry.start_time >= range.from && (
        <View style={[styles.target, targets.start]}>
          <View style={styles.grip} />
        </View>
      )}
      {rect.entry.end_time <= range.to && (
        <View style={[styles.target, targets.end]}>
          <View style={styles.grip} />
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  outline: {
    position: "absolute",
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: radii.block,
  },
  target: {
    position: "absolute",
    width: controls.touchTarget,
    height: controls.touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  grip: {
    width: 24,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.canvas,
    backgroundColor: colors.accent,
  },
  label: {
    position: "absolute",
    backgroundColor: colors.ink,
    color: colors.surface,
    fontSize: typeSize.caption,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
});

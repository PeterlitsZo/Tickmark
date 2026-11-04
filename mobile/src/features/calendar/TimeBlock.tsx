import { CornerDownLeft, CornerDownRight } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import type { TimeRange } from "../../api/entries";
import { clockTime } from "../../lib/time";
import { colors } from "../../theme";
import { blockFrame, type PositionedEntry } from "./timelineGeometry";

export function TimeBlock({
  item,
  range,
  width,
  dimmed,
  pending,
  onEdit,
}: {
  item: PositionedEntry;
  range: TimeRange;
  width: number;
  dimmed: boolean;
  pending: boolean;
  onEdit: () => void;
}) {
  const visibleHeight = item.height - Math.min(2, item.height / 4);
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${item.entry.title}, ${clockTime(item.entry.start_time)} to ${clockTime(item.entry.end_time)}${pending ? ", saving" : ". Edit entry."}`}
      onAccessibilityTap={onEdit}
      style={[
        styles.block,
        blockFrame(item, width),
        { height: visibleHeight, paddingVertical: Math.min(4, visibleHeight / 2) },
        dimmed && { opacity: 0.3 },
        pending && styles.pending,
        item.entry.start_time === item.entry.end_time && styles.point,
      ]}
    >
      <View pointerEvents="none" style={styles.accentBar} />
      <View style={styles.titleRow}>
        {item.entry.start_time < range.from && (
          <CornerDownRight size={12} color={colors.accent} />
        )}
        <Text numberOfLines={1} style={styles.title}>
          {item.entry.title}
        </Text>
        {item.entry.end_time > range.to && (
          <CornerDownLeft size={12} color={colors.accent} />
        )}
      </View>
      {visibleHeight > 44 && (
        <Text numberOfLines={1} style={styles.time}>
          {clockTime(item.entry.start_time)} – {clockTime(item.entry.end_time)}
          {pending ? " · Pending" : ""}
        </Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  block: {
    position: "absolute",
    borderRadius: 5,
    backgroundColor: colors.block,
    paddingLeft: 11,
    paddingRight: 8,
    overflow: "hidden",
  },
  pending: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.accent,
  },
  point: { backgroundColor: colors.wash },
  accentBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: colors.blockBorder,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  title: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: colors.accent,
  },
  time: {
    fontSize: 10,
    color: colors.accent,
    marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
});

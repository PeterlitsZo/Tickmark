import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { clockTime, dateOf, offsetLabel, otherOccurrences } from "../../lib/time";
import { colors, controls, spacing, typeSize } from "../../theme";

export function EntryTimeRow({
  label,
  value,
  disabled,
  error,
  onSelect,
}: {
  label: string;
  value: number;
  disabled: boolean;
  error?: string;
  onSelect: (mode: "date" | "time") => void;
}) {
  const date = dateOf(value);
  const ambiguous = otherOccurrences(value).length > 0;
  const dateLabel = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== new Date().getFullYear()
      ? { year: "numeric" }
      : {}),
  });
  return (
    <View>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} time`}
          disabled={disabled}
          onPress={() => onSelect("time")}
          style={styles.timeButton}
        >
          <Text style={styles.time}>{clockTime(value)}</Text>
          {ambiguous && <Text style={styles.offset}>{offsetLabel(value)}</Text>}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} date`}
          disabled={disabled}
          onPress={() => onSelect("date")}
          style={styles.dateButton}
        >
          <Text style={styles.date}>{dateLabel}</Text>
          <ChevronRight size={controls.smallIcon} color={colors.muted} />
        </Pressable>
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: controls.timeRow,
    gap: 10,
  },
  label: { width: 42, color: colors.muted, fontSize: typeSize.label },
  timeButton: {
    minWidth: controls.timeWidth,
    minHeight: controls.timeRow,
    justifyContent: "center",
  },
  time: {
    fontSize: typeSize.time,
    fontVariant: ["tabular-nums"],
    color: colors.ink,
    fontWeight: "500",
  },
  dateButton: {
    flex: 1,
    minWidth: 0,
    minHeight: controls.timeRow,
    justifyContent: "flex-end",
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  date: { fontSize: typeSize.body, color: colors.muted, flexShrink: 1 },
  offset: { fontSize: typeSize.caption, color: colors.muted, paddingBottom: spacing.xs },
  error: {
    color: colors.danger,
    fontSize: typeSize.secondary,
    paddingBottom: 6,
  },
});

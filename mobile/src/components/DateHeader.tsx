import { ChevronDown, Plus } from "lucide-react-native";
import { IconButton } from "./IconButton";
import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEntries } from "../features/entries/EntriesProvider";
import { dateOf, dayKey, localDay, seconds, shiftDay } from "../lib/time";
import { colors } from "../theme";
import { Button } from "./Button";
import { DateTimeSelector } from "./DateTimeSelector";

export function DateHeader() {
  const { selectedDay, setSelectedDay, create } = useEntries();
  const [picker, setPicker] = useState(false);
  const insets = useSafeAreaInsets();
  const date = localDay(selectedDay);
  const today = dayKey(new Date());
  const monday = shiftDay(selectedDay, -((date.getDay() + 6) % 7));
  return (
    <View style={styles.header}>
      <View style={styles.topline}>
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose date"
            onPress={() => {
              setPicker(true);
            }}
            style={styles.monthButton}
          >
            <Text style={styles.month}>
              {date.toLocaleDateString("en-US", { month: "long" })}{" "}
              <Text style={styles.year}>{date.getFullYear()}</Text>
            </Text>
            <ChevronDown size={17} color={colors.muted} strokeWidth={1.8} />
          </Pressable>
        </View>
        <View style={styles.actions}>
          <Button label="Today" onPress={() => setSelectedDay(today)} />
          <IconButton
            icon={Plus}
            label="Add entry"
            primary
            onPress={() => create()}
          />
        </View>
      </View>
      <View style={styles.week}>
        {Array.from({ length: 7 }, (_, i) => {
          const key = shiftDay(monday, i);
          const day = localDay(key);
          const selected = key === selectedDay;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={day.toDateString()}
              accessibilityState={{ selected }}
              onPress={() => setSelectedDay(key)}
              style={[styles.day, selected && styles.selectedDay]}
            >
              <Text style={[styles.weekday, selected && styles.selectedText]}>
                {day
                  .toLocaleDateString("en-US", { weekday: "short" })
                  .slice(0, 1)}
              </Text>
              <Text style={[styles.dayNumber, selected && styles.selectedText]}>
                {day.getDate()}
              </Text>
              <View
                style={[
                  styles.dot,
                  key === today && {
                    backgroundColor: selected ? colors.surface : colors.accent,
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
      <Modal
        visible={picker}
        transparent
        animationType="fade"
        onRequestClose={() => setPicker(false)}
      >
        <View style={styles.scrim}>
          <Pressable
            accessibilityLabel="Close date picker"
            onPress={() => setPicker(false)}
            style={StyleSheet.absoluteFill}
          />
          <View
            accessibilityViewIsModal
            style={[
              styles.monthSheet,
              { paddingBottom: Math.max(insets.bottom, 24) },
            ]}
          >
            {picker && (
              <ScrollView>
                <DateTimeSelector
                  value={seconds(date)}
                  mode="date"
                  showTimeZone={false}
                  onCancel={() => setPicker(false)}
                  onApply={(value) => {
                    setSelectedDay(dayKey(dateOf(value)));
                    setPicker(false);
                  }}
                />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.canvas,
    paddingHorizontal: 20,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  topline: {
    flexWrap: "wrap",
    gap: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  monthButton: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    gap: 5,
  },
  month: {
    fontSize: 22,
    letterSpacing: -0.9,
    fontWeight: "600",
    color: colors.ink,
  },
  year: { fontSize: 18, fontWeight: "400", color: colors.muted },
  actions: { flexDirection: "row", gap: 2 },
  week: { flexDirection: "row", gap: 5, paddingBottom: 10 },
  day: {
    flex: 1,
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 7,
  },
  selectedDay: { backgroundColor: colors.ink, borderRadius: 7 },
  selectedText: { color: colors.surface },
  weekday: { fontSize: 11, color: colors.muted, fontWeight: "500" },
  dayNumber: { fontSize: 17, color: colors.ink, fontWeight: "500" },
  dot: { height: 3, width: 3, borderRadius: 2 },
  scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "#20251F55" },
  monthSheet: {
    maxHeight: "90%",
    backgroundColor: colors.canvas,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
  },
});

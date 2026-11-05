import { router } from "expo-router";
import { Alert, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MoreHorizontal } from "lucide-react-native";
import { IconButton } from "../../components/IconButton";
import { DateHeader } from "../../components/DateHeader";
import { QueryStatus } from "../../components/QueryStatus";
import { Timeline } from "../../features/calendar/Timeline";
import { useEntries } from "../../features/entries/EntriesProvider";
import { localDay } from "../../lib/time";
import { colors } from "../../theme";

export default function CalendarScreen() {
  const { selectedDay, range, query } = useEntries();
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={styles.screen}
    >
      <DateHeader />
      <View style={styles.dayHeading}>
        <View style={{ flex: 1 }}>
          <Text style={styles.day}>
            {localDay(selectedDay).toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </Text>
          <Text style={styles.hint}>
            {query.data?.items.length === 0
              ? "No entries yet · Hold & drag to add"
              : "Hold to move · Drag edges to adjust"}
          </Text>
        </View>
        <IconButton
          icon={MoreHorizontal}
          label="Calendar actions"
          loading={query.isRefetching}
          onPress={() => {
            Alert.alert("Calendar", undefined, [
              { text: "Refresh", onPress: () => { void query.refetch(); } },
              { text: "Manage categories", onPress: () => router.push("/categories") },
              { text: "Cancel", style: "cancel" },
            ]);
          }}
        />
      </View>
      <View style={styles.timeline}>
        <Timeline key={`${selectedDay}-${range.from}`} />
        <QueryStatus />
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  timeline: { flex: 1 },
  dayHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 22,
    paddingRight: 12,
    paddingVertical: 10,
  },
  day: { fontSize: 13, fontWeight: "600", color: colors.ink },
  hint: { fontSize: 10, color: colors.muted, marginTop: 5 },
});

import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { entryTime } from "../lib/time";
import { useEntries } from "../features/entries/EntriesProvider";
import { colors } from "../theme";
import { Button } from "./Button";

function StatusContent() {
  const { query, online, notice, mutations, setNotice } = useEntries();
  const operation = Object.values(mutations.pending)[0];
  if (operation) {
    const busy = operation.status !== "uncertain";
    return (
      <View accessibilityLiveRegion="polite" style={styles.notice}>
        <Text numberOfLines={1} style={styles.text}>
          {operation.original.title}
        </Text>
        <Text style={styles.text}>{operation.message}</Text>
        {!busy && (
          <>
            <Text style={styles.text}>
              Before: {entryTime(operation.original)}
            </Text>
            <Text style={styles.text}>
              Requested:{" "}
              {entryTime({ ...operation.target, id: operation.original.id })}
            </Text>
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Button
                label="Check again"
                disabled={!online}
                onPress={() => {
                  void mutations.reconcile(operation.original.id);
                }}
              />
              <Button
                label="Retry change"
                disabled={!online}
                onPress={() =>
                  Alert.alert(
                    "Retry this change?",
                    "This sends the same title and time again. It can overwrite changes made on another device.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Retry",
                        onPress: () => {
                          void mutations
                            .retry(operation.original.id)
                            .catch((error: unknown) =>
                              setNotice(
                                error instanceof Error
                                  ? error.message
                                  : "Could not save changes.",
                              ),
                            );
                        },
                      },
                    ],
                  )
                }
              />
            </View>
          </>
        )}
      </View>
    );
  }
  if (notice)
    return (
      <View accessibilityLiveRegion="polite" style={styles.notice}>
        <Text style={styles.text}>{notice}</Text>
      </View>
    );
  if (!online)
    return (
      <View style={styles.notice}>
        <Text style={styles.text}>
          You’re offline. Showing available entries.
        </Text>
      </View>
    );
  if (query.isError)
    return (
      <View style={styles.row}>
        <Text style={[styles.text, { flex: 1 }]}>Could not load entries.</Text>
        <Button
          label="Retry"
          onPress={() => {
            void query.refetch();
          }}
        />
      </View>
    );
  if (query.isFetching)
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={colors.muted} />
        <Text style={styles.text}>
          {query.data ? "Updating…" : "Loading entries…"}
        </Text>
      </View>
    );
  return null;
}
const styles = StyleSheet.create({
  notice: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: colors.wash,
  },
  text: { fontSize: 12, color: colors.muted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    backgroundColor: colors.dangerWash,
  },
  loading: {
    backgroundColor: colors.canvas,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
});

export function QueryStatus() {
  return (
    <View pointerEvents="box-none" style={overlayStyle.container}>
      <StatusContent />
    </View>
  );
}
const overlayStyle = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 12,
    borderRadius: 8,
    overflow: "hidden",
  },
});

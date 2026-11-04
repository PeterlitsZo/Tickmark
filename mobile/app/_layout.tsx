import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  EntriesProvider,
  useEntries,
} from "../src/features/entries/EntriesProvider";
import { EntryEditor } from "../src/features/entries/EntryEditor";
import { colors } from "../src/theme";

function AppContent() {
  const { draft } = useEntries();
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
        }}
      />
      {draft && <EntryEditor key={draft.entry?.id ?? "new"} draft={draft} />}
    </>
  );
}
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <SafeAreaProvider>
        <EntriesProvider>
          <AppContent />
        </EntriesProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

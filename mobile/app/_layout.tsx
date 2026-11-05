import { useLayoutEffect } from "react";
import { WorkspaceProvider } from "../src/features/workspace/WorkspaceProvider";
import { View, useWindowDimensions } from "react-native";
import { Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
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
  const pathname = usePathname();
  const { width, height, fontScale } = useWindowDimensions();
  // Hide before paint: waiting for passive effects can leave Android behind its splash.
  useLayoutEffect(() => { SplashScreen.hide(); }, [width, height, fontScale]);
  const editing = !!draft && pathname !== "/categories";
  return (
    <>
      <StatusBar style="dark" />
      <View collapsable={false} style={{ flex: 1 }} accessibilityElementsHidden={editing} importantForAccessibility={editing ? "no-hide-descendants" : "auto"}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
        }}
      />
      </View>
      {draft && <EntryEditor key={draft.entry?.id ?? "new"} draft={draft} />}
    </>
  );
}
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <SafeAreaProvider>
        <EntriesProvider>
          <WorkspaceProvider><AppContent /></WorkspaceProvider>
        </EntriesProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

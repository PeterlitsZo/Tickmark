import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetFooter,
  type BottomSheetFooterProps,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import {
  BackHandler,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import { Button } from "../../components/Button";
import { IconButton } from "../../components/IconButton";
import { DateTimeSelector } from "../../components/DateTimeSelector";
import { colors } from "../../theme";
import { validateInput } from "../../lib/time";
import { type Draft } from "./EntriesProvider";
import { useEntryEditor } from "./useEntryEditor";
import { EntryForm } from "./EntryForm";

type Picker = { field: "start_time" | "end_time"; mode: "date" | "time" };

export function EntryEditor({ draft }: { draft: Draft }) {
  const editor = useEntryEditor(draft);
  const { input, setInput, busy, missing, uncertain, online, close } = editor;
  const [picker, setPicker] = useState<Picker | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const title = useRef<ComponentRef<typeof TextInput> | null>(null);
  const focused = useRef(false);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const disabled = busy || missing || uncertain;

  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const hidden = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  useEffect(() => {
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      if (picker) setPicker(null);
      else close();
      return true;
    });
    return () => back.remove();
  }, [close, picker]);

  const backdrop = (props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      pressBehavior="none"
      opacity={0.24}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel="Close entry editor"
        onPress={close}
      />
    </BottomSheetBackdrop>
  );
  const dismissGesture = Gesture.Pan()
    .minDistance(8)
    .onEnd((event, success) => {
      if (success && event.translationY > 35) scheduleOnRN(close);
    });
  const handle = () => (
    <GestureDetector gesture={dismissGesture}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel="Close entry editor"
        onAccessibilityTap={close}
        style={styles.handleArea}
      >
        <View style={styles.handle} />
      </View>
    </GestureDetector>
  );
  const footer = (props: BottomSheetFooterProps) => (
    <BottomSheetFooter {...props}>
      <View
        style={[
          styles.footer,
          { paddingBottom: keyboardVisible ? 12 : Math.max(insets.bottom, 16) },
        ]}
      >
        {missing ? (
          <Button
            label="Close and refresh"
            onPress={() => {
              void editor.refreshAll();
              editor.close();
            }}
          />
        ) : (
          <Button
            label="Save"
            kind="primary"
            loading={busy}
            disabled={disabled || !online}
            onPress={() => {
              void editor.write();
            }}
          />
        )}
      </View>
    </BottomSheetFooter>
  );
  return (
    <BottomSheet
      index={0}
      enableDynamicSizing
      maxDynamicContentSize={height - insets.top - 12}
      topInset={insets.top}
      enablePanDownToClose={false}
      enableHandlePanningGesture={false}
      enableContentPanningGesture={false}
      backdropComponent={backdrop}
      footerComponent={picker ? undefined : footer}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustPan"
      enableBlurKeyboardOnGesture
      backgroundStyle={styles.background}
      handleComponent={handle}
      onChange={(index) => {
        if (index >= 0 && !draft.entry && !focused.current) {
          focused.current = true;
          title.current?.focus();
        }
      }}
    >
      <BottomSheetScrollView
        keyboardShouldPersistTaps="handled"
        enableFooterMarginAdjustment={!picker}
        contentContainerStyle={[
          styles.body,
          { paddingBottom: picker ? Math.max(insets.bottom, 16) : 0 },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.heading}>
            {picker
              ? `${picker.field === "start_time" ? "Start" : "End"} ${picker.mode}`
              : draft.entry
                ? "Edit entry"
                : "What did you do?"}
          </Text>
          <IconButton
            icon={X}
            label={picker ? "Cancel time selection" : "Close entry editor"}
            disabled={busy}
            onPress={picker ? () => setPicker(null) : close}
          />
        </View>
        {picker ? (
          <DateTimeSelector
            key={`${picker.field}-${picker.mode}`}
            mode={picker.mode}
            value={input[picker.field]}
            onCancel={() => setPicker(null)}
            onApply={(value) => {
              const next = { ...input, [picker.field]: value };
              const { errors } = validateInput(next.title, next.start_time, next.end_time);
              setInput(next);
              editor.setFields((previous) => ({ ...previous, start_time: errors.start_time ?? "", end_time: errors.end_time ?? "" }));
              setPicker(null);
            }}
          />
        ) : (
          <EntryForm
            draft={draft}
            editor={editor}
            inputRef={(instance) => {
              title.current = instance as ComponentRef<typeof TextInput> | null;
            }}
            onSelect={(field, mode) => {
              Keyboard.dismiss();
              setPicker({ field, mode });
            }}
          />
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}
const styles = StyleSheet.create({
  background: { backgroundColor: colors.canvas, borderRadius: 18 },
  handle: { width: 28, height: 3, backgroundColor: colors.line },
  handleArea: { height: 24, alignItems: "center", justifyContent: "center" },
  body: { paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  heading: {
    flex: 1,
    fontSize: 18,
    color: colors.ink,
    fontWeight: "600",
    letterSpacing: -0.4,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    backgroundColor: colors.canvas,
  },
});

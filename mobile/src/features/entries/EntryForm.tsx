import { CategoryField } from "../categories/CategoryField";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Trash2 } from "lucide-react-native";
import { Button } from "../../components/Button";
import { IconButton } from "../../components/IconButton";
import { duration } from "../../lib/time";
import { colors, controls, spacing, typeSize } from "../../theme";
import type { Draft } from "./EntriesProvider";
import type { useEntryEditor } from "./useEntryEditor";
import { EntryTimeRow } from "./EntryTimeRow";

export function EntryForm({
  draft,
  editor,
  inputRef,
  onSelect,
  onChooseCategory,
}: {
  draft: Draft;
  editor: ReturnType<typeof useEntryEditor>;
  inputRef: (instance: unknown) => void;
  onChooseCategory: () => void;
  onSelect: (field: "start_time" | "end_time", mode: "date" | "time") => void;
}) {
  const { input, setInput, busy, missing, uncertain, online } = editor;
  const disabled = busy || missing || uncertain;
  return (
    <>
      <BottomSheetTextInput
        ref={inputRef}
        accessibilityLabel="Activity title"
        placeholder="Activity title"
        placeholderTextColor={colors.muted}
        value={input.title}
        onChangeText={(value) => {
          setInput((previous) => ({ ...previous, title: value }));
          editor.setFields((previous) => ({ ...previous, title: "" }));
        }}
        editable={!disabled}
        multiline
        style={[styles.input, !!editor.fields.title && styles.invalid]}
      />
      {!!editor.fields.title && (
        <Text style={styles.error}>{editor.fields.title}</Text>
      )}
      <CategoryField value={input.category_id} disabled={disabled} error={editor.fields.category_id} onChoose={onChooseCategory} />
      {(["start_time", "end_time"] as const).map((field) => (
        <EntryTimeRow
          key={field}
          label={field === "start_time" ? "Start" : "End"}
          value={input[field]}
          disabled={disabled}
          error={editor.fields[field]}
          onSelect={(mode) => {
            onSelect(field, mode);
          }}
        />
      ))}
      <View style={styles.summary}>
        <Text style={styles.duration}>
          {input.end_time >= input.start_time
            ? duration(input.end_time - input.start_time)
            : "Check times"}
        </Text>
        {draft.entry && (
          <IconButton
            icon={Trash2}
            label="Delete entry"
            disabled={disabled || !online}
            onPress={() =>
              Alert.alert(
                "Delete entry?",
                "This permanently deletes the entry.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => {
                      void editor.write(true);
                    },
                  },
                ],
              )
            }
          />
        )}
      </View>
      {!!editor.error && (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {editor.error}
        </Text>
      )}
      {!online && (
        <Text style={styles.error}>
          You’re offline. Your draft will stay here.
        </Text>
      )}
      {uncertain && (
        <Button
          label="Check whether it saved"
          loading={busy}
          disabled={!online}
          onPress={() => {
            void editor.checkSave();
          }}
        />
      )}
    </>
  );
}
const styles = StyleSheet.create({
  input: {
    minHeight: controls.touchTarget,
    maxHeight: 104,
    fontSize: typeSize.title,
    lineHeight: 24,
    color: colors.ink,
    paddingHorizontal: 0,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    marginBottom: spacing.sm,
  },
  invalid: { borderBottomColor: colors.danger },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: controls.touchTarget,
    marginBottom: spacing.sm,
  },
  duration: { fontSize: typeSize.secondary, color: colors.muted },
  error: {
    color: colors.danger,
    fontSize: typeSize.secondary,
    paddingVertical: 6,
    lineHeight: 17,
  },
});

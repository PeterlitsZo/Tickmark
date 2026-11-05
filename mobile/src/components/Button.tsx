import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { colors } from "../theme";

export function Button({
  label,
  onPress,
  disabled,
  loading,
  kind = "plain",
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  kind?: "plain" | "primary" | "danger";
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        kind === "primary" && styles.primary,
        kind === "danger" && styles.danger,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={kind === "primary" ? colors.surface : colors.ink}
        />
      ) : (
        <Text
          style={[
            styles.text,
            kind === "primary" && styles.primaryText,
            kind === "danger" && styles.dangerText,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  primary: { backgroundColor: colors.accent },
  danger: { backgroundColor: colors.dangerWash },
  text: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  primaryText: { color: colors.surface },
  dangerText: { color: colors.danger },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.65 },
});

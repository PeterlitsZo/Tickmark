import type { LucideIcon } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { colors, controls, radii } from "../theme";

type IconButtonProps = {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  primary?: boolean;
};

export function IconButton({
  icon: Icon,
  label,
  onPress,
  disabled,
  loading,
  primary,
}: IconButtonProps) {
  const color = primary ? colors.surface : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && styles.primary,
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Icon
          size={controls.icon}
          strokeWidth={controls.stroke}
          color={color}
        />
      )}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: {
    width: controls.touchTarget,
    height: controls.touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.control,
  },
  primary: { backgroundColor: colors.accent },
  dimmed: { opacity: 0.5 },
});

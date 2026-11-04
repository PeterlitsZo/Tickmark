import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import DateTimePicker, {
  type DateType,
  useDefaultStyles,
} from "react-native-ui-datepicker";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { offsetLabel, otherOccurrences } from "../lib/time";
import { applyPickerValue, pickerValue } from "../lib/pickerTime";
import { colors } from "../theme";
import { Button } from "./Button";

dayjs.extend(utc);

type Props = {
  value: number;
  showTimeZone?: boolean;
  mode: "date" | "time";
  onApply: (value: number) => void;
  onCancel: () => void;
};

export function DateTimeSelector({
  value,
  mode,
  onApply,
  onCancel,
  showTimeZone = true,
}: Props) {
  const [selected, setSelected] = useState(value);
  const [warning, setWarning] = useState("");
  const defaults = useDefaultStyles();
  const select = (value: DateType) => {
    // The installed picker returns Date. Reject ambiguous string formats.
    if (value == null || typeof value === "string") return;
    const milliseconds = Number(value.valueOf());
    if (!Number.isFinite(milliseconds)) return;
    const next = applyPickerValue(selected, milliseconds, mode);
    setSelected(next.timestamp);
    setWarning(next.warning);
  };
  return (
    <View>
      <DateTimePicker
        mode="single"
        locale="en"
        date={dayjs.utc(pickerValue(selected))}
        timeZone="UTC"
        hideHeader={mode === "time"}
        initialView={mode === "date" ? "day" : "time"}
        timePicker={mode === "time"}
        use12Hours={false}
        firstDayOfWeek={1}
        minDate={new Date(0)}
        onChange={({ date }) => select(date)}
        containerHeight={mode === "date" ? 264 : 220}
        styles={{
          ...defaults,
          selected: { backgroundColor: colors.ink, borderRadius: 8 },
          selected_label: { color: colors.surface },
          today: { borderColor: colors.line, borderWidth: 1, borderRadius: 8 },
        }}
        components={{
          IconPrev: <ChevronLeft size={20} color={colors.ink} />,
          IconNext: <ChevronRight size={20} color={colors.ink} />,
        }}
      />
      {!!warning && (
        <Text accessibilityLiveRegion="polite" style={styles.warning}>
          {warning}
        </Text>
      )}
      {otherOccurrences(selected).map((other) => (
        <Button
          key={other}
          label={`Use ${offsetLabel(other)} instead of ${offsetLabel(selected)}`}
          onPress={() => setSelected(other)}
        />
      ))}
      {showTimeZone && (
        <Text style={styles.offset}>{offsetLabel(selected)}</Text>
      )}
      <View style={styles.actions}>
        <Button label="Cancel" onPress={onCancel} />
        <Button label="Done" kind="primary" onPress={() => onApply(selected)} />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  warning: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    paddingVertical: 8,
  },
  offset: { color: colors.muted, fontSize: 11, textAlign: "center" },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
  },
});

import { StyleSheet } from 'react-native';
import { colors } from '../../theme';
export const workspaceStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  header: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heading: { fontSize: 30, fontWeight: '600', letterSpacing: -0.8, color: colors.ink },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 6 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: colors.ink, backgroundColor: colors.surface },
  content: { paddingHorizontal: 22, paddingBottom: 24, gap: 12 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginVertical: 12 },
  title: { fontSize: 16, fontWeight: '500', color: colors.ink },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, paddingVertical: 8 },
  notice: { padding: 14, borderRadius: 10, backgroundColor: colors.dangerWash, marginBottom: 12 },
  skeleton: { height: 52, borderRadius: 10, backgroundColor: colors.wash, marginBottom: 12 },
  separator: { height: 1, backgroundColor: colors.line, marginVertical: 12 },
});

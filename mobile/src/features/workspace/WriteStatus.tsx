import { Text, View } from 'react-native';
import { Button } from '../../components/Button';
import type { useWriteGuard } from './useWriteGuard';
import { workspaceStyles as s } from './styles';
export function WriteStatus({ state, online }: { state: ReturnType<typeof useWriteGuard>; online: boolean }) {
  if (!state.error && online && !state.busy) return null;
  return <View accessibilityLiveRegion="polite" style={s.notice}>
    <Text style={s.error}>{!online ? 'You’re offline. Cached items and drafts stay here; reconnect to make changes.' : state.busy ? 'Checking or saving changes…' : state.error}</Text>
    {Object.entries(state.fields).map(([field, message]) => <Text key={field} style={s.error}>{field}: {message}</Text>)}
    {state.uncertain && <Button label="Check status" disabled={!online} loading={state.busy} onPress={() => { void state.check(); }} />}
  </View>;
}

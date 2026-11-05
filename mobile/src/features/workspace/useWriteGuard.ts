import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { ApiError } from '../../api/client';

// Hosted above navigation: a tab change cannot discard request recovery state.
export function useWriteGuard(online: boolean, refresh: () => Promise<unknown>) {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  async function run(action: () => Promise<void>) {
    if (locked.current || uncertain) return false;
    if (!online) { setError('You’re offline. Reconnect before making changes.'); return false; }
    locked.current = true; setBusy(true); setError(''); setFields({});
    try { await action(); return true; }
    catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save this change.');
      if (failure instanceof ApiError) {
        setUncertain(failure.uncertain); setFields(failure.fields);
      }
      return false;
    } finally { locked.current = false; setBusy(false); }
  }
  async function check() {
    if (locked.current || !online) return;
    locked.current = true; setBusy(true);
    try {
      await refresh();
      setError('List refreshed. Inspect the current items before allowing another change. A matching name alone cannot confirm a save.');
      Alert.alert('Review the refreshed list', 'A delayed create can still cause duplicates. Retrying an edit can overwrite another device’s changes. Keep checking until you are ready to allow further changes.', [
        { text: 'Keep checking', style: 'cancel' },
        { text: 'Allow further changes', onPress: () => { setUncertain(false); setError(''); } },
      ]);
    } catch { setError('Could not check the latest data. Reconnect and try again.'); }
    finally { locked.current = false; setBusy(false); }
  }
  return { busy, uncertain, error, fields, setError, setFields, run, check, disabled: busy || uncertain || !online };
}

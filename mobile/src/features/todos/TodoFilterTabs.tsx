import { useRef, useState, type ComponentRef } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react-native';
import { ApiError } from '../../api/client';
import { todoFiltersApi, filterError, type SavedTodoFilter, type TodoFilterInput } from '../../api/todoFilters';
import { filterInputError } from '../../../../shared/todoFilters';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { colors } from '../../theme';
import { TodoFilterHelp } from './TodoFilterHelp';
import { todoFiltersKey } from './useTodoFilters';

export function TodoFilterTabs({ filters, selected, online, onSelect }: { filters: SavedTodoFilter[]; selected: string; online: boolean; onSelect: (id: string) => void }) {
  const client = useQueryClient();
  const lock = useRef(false);
  const expression = useRef<ComponentRef<typeof TextInput>>(null);
  const [visible, setVisible] = useState(false);
  const [id, setId] = useState('');
  const [draft, setDraft] = useState<TodoFilterInput>({ name: '', filter_expr: '' });
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  function open(filter?: SavedTodoFilter) {
    setId(filter?.id ?? ''); setDraft(filter ? { name: filter.name, filter_expr: filter.filter_expr } : { name: '', filter_expr: "status = 'OPEN'" });
    setHelp(false); setError(''); setUncertain(false); setVisible(true);
  }
  function close() { if (!lock.current) { if (help) setHelp(false); else setVisible(false); } }
  async function commit(saved?: SavedTodoFilter) {
    await client.cancelQueries({ queryKey: todoFiltersKey });
    client.setQueryData<SavedTodoFilter[]>(todoFiltersKey, previous => {
      const next = (previous ?? []).filter(item => item.id !== (saved?.id ?? id));
      if (saved) next.push(saved);
      return next.sort((a, b) => a.position - b.position || a.id.length - b.id.length || a.id.localeCompare(b.id));
    });
    void client.invalidateQueries({ queryKey: todoFiltersKey });
    onSelect(saved?.id ?? ''); setVisible(false);
  }
  async function submit(remove = false) {
    if (lock.current || uncertain || !online) return;
    const invalid = remove ? '' : filterInputError(draft);
    if (invalid) { setError(invalid); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      if (remove) { await todoFiltersApi.remove(id); await commit(); }
      else await commit(await (id ? todoFiltersApi.update(id, draft) : todoFiltersApi.create(draft)));
    } catch (cause) {
      setError(filterError(cause)); setUncertain(!(cause instanceof ApiError) || cause.uncertain);
      if (cause instanceof ApiError && cause.reason === 'TODO_FILTER_NOT_FOUND') void client.invalidateQueries({ queryKey: todoFiltersKey });
    } finally { lock.current = false; setBusy(false); }
  }
  async function check() {
    if (lock.current || !online) return;
    lock.current = true; setBusy(true);
    try {
      const latest = await todoFiltersApi.list(); client.setQueryData(todoFiltersKey, latest);
      Alert.alert('Review current filters', `${latest.map(item => item.name).join(', ') || '(none)'}\nA delayed request may still finish. Check for your change before retrying.`, [
        { text: 'Keep checking', style: 'cancel' },
        { text: 'Allow another attempt', onPress: () => { setUncertain(false); setError(''); } },
      ]);
    } catch (cause) { setError(filterError(cause)); }
    finally { lock.current = false; setBusy(false); }
  }
  function useExample(value: string) {
    const apply = () => { setDraft({ ...draft, filter_expr: value }); setHelp(false); requestAnimationFrame(() => expression.current?.focus()); };
    if (draft.filter_expr.trim() && draft.filter_expr !== value) Alert.alert('Replace your expression?', 'This fills the example without saving the tab.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Replace', onPress: apply }]);
    else apply();
  }
  return <>
    <View style={s.bar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 16 }}>
        {[{ id: '', name: 'All' }, ...filters].map(item => <Pressable accessibilityRole="tab" accessibilityState={{ selected: item.id === selected }} key={item.id} onPress={() => onSelect(item.id)} style={[s.tab, item.id === selected && s.selected]}><Text numberOfLines={1} style={[s.tabText, item.id === selected && { color: colors.accent }]}>{item.name}</Text></Pressable>)}
      </ScrollView>
      {filters.some(item => item.id === selected) && <IconButton icon={Pencil} label="Edit filter" onPress={() => open(filters.find(item => item.id === selected))} />}
      <IconButton icon={Plus} label="Create filter tab" onPress={() => open()} />
    </View>
    <Modal visible={visible} animationType="slide" onRequestClose={close} presentationStyle="fullScreen">
      <SafeAreaProvider>
      <SafeAreaView style={s.screen}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[{ flex: 1 }, help && { display: 'none' }]} accessibilityElementsHidden={help} importantForAccessibility={help ? 'no-hide-descendants' : 'auto'}>
            <View style={s.header}><Text accessibilityRole="header" style={s.heading}>{id ? 'Edit filter' : 'Create filter tab'}</Text><Button label="Cancel" disabled={busy} onPress={close} /></View>
            <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
              <Text style={s.label}>Tab name</Text><TextInput accessibilityLabel="Tab name" autoFocus value={draft.name} editable={!busy && !uncertain} onChangeText={name => setDraft({ ...draft, name })} style={s.input} />
              <View style={s.header}><Text style={s.label}>Filter expression</Text><Button label="Expression help" onPress={() => setHelp(true)} /></View>
              <TextInput ref={expression} accessibilityLabel="Filter expression" value={draft.filter_expr} editable={!busy && !uncertain} onChangeText={filter_expr => setDraft({ ...draft, filter_expr })} multiline autoCorrect={false} autoCapitalize="none" textAlignVertical="top" style={[s.input, { minHeight: 150 }]} />
              <Text style={s.muted}>Show todos that match this condition. Open Expression help for examples and syntax.</Text>
              {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
              {uncertain && <><Text style={s.muted}>This change may have saved. Check the latest filters before retrying.</Text><Button label="Check latest filters" disabled={busy || !online} onPress={() => void check()} /></>}
              {!online && <Text style={s.muted}>Connect to validate and save. Expression help is still available.</Text>}
              <Text style={s.muted}>Saved across your devices.</Text>
              <Button label={id ? 'Save filter' : 'Create tab'} kind="primary" loading={busy} disabled={uncertain || !online} onPress={() => void submit()} />
              {!!id && <Button label="Delete filter" kind="danger" disabled={busy || uncertain || !online} onPress={() => Alert.alert('Delete this filter?', 'Your todos will not be deleted.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete filter', style: 'destructive', onPress: () => void submit(true) }])} />}
            </ScrollView>
          </View>
          {help && <TodoFilterHelp onClose={() => setHelp(false)} onUse={useExample} />}
        </KeyboardAvoidingView>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  </>;
}
const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.line, marginTop: 12 },
  tab: { minHeight: 44, maxWidth: 180, justifyContent: 'center', borderBottomWidth: 2, borderColor: 'transparent', paddingHorizontal: 2 },
  selected: { borderColor: colors.accent }, tabText: { fontSize: 15, color: colors.muted },
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  heading: { color: colors.ink, fontSize: 22, fontWeight: '600' }, form: { padding: 20, gap: 16 },
  label: { color: colors.ink, fontSize: 15 }, input: { borderColor: colors.line, borderWidth: 1, borderRadius: 8, padding: 12, color: colors.ink, fontSize: 16 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 22 }, error: { color: colors.danger, fontSize: 14, lineHeight: 22 },
});

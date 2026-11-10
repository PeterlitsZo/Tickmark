import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronDown, ChevronRight, MoreVertical, Plus, RotateCw } from 'lucide-react-native';
import { useEffect, useRef, type ComponentRef } from 'react';
import { TodoFilterTabs } from './TodoFilterTabs';
import { filterError } from '../../api/todoFilters';
import type { Todo } from '../../api/todos';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { colors } from '../../theme';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { workspaceStyles as s } from '../workspace/styles';
import { WriteStatus } from '../workspace/WriteStatus';

export default function TodosScreen() {
  const w = useWorkspace();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => { if (w.todoWrite.error) scroll.current?.scrollTo({ y: 0, animated: true }); }, [w.todoWrite.error]);
  const selected = w.filterState.selected;
  const matches = selected ? w.filteredTodos.data : w.todos.data;
  const visible = [...(matches ?? [])];
  const editingTodo = w.todos.data?.find(todo => todo.id === w.todoEdit?.id);
  const retained = editingTodo && !visible.some(todo => todo.id === editingTodo.id);
  if (retained) visible.push(editingTodo);
  const open = visible.filter(todo => todo.status === 'OPEN');
  const completed = visible.filter(todo => todo.status === 'COMPLETED');
  const count = matches?.filter(todo => todo.status === 'OPEN').length;
  function selectFilter(id: string) {
    if (w.todoEdit) { Alert.alert('Finish editing first', 'Save or cancel the current todo before switching filters.'); return; }
    w.filterState.select(id);
  }
  function refresh() { void w.todos.refetch(); void w.filterState.query.refetch(); if (selected) void w.filteredTodos.refetch(); }
  const beginEdit = (todo: Todo) => {
    if (w.todoWrite.disabled) return;
    if (w.todoEdit && w.todoEdit.id !== todo.id) {
      Alert.alert('Finish editing this todo first', 'Save or cancel the current title before editing another item.'); return;
    }
    w.setTodoEdit({ id: todo.id, title: todo.title });
  };
  const row = (todo: Todo) => <View key={todo.id} style={styles.task}>
    {w.todoEdit?.id === todo.id ? <View style={{ flex: 1, gap: 6 }}>
      <TextInput accessibilityLabel="Edit todo title" autoFocus multiline style={s.input} value={w.todoEdit.title} editable={!w.todoWrite.disabled}
        onChangeText={title => w.setTodoEdit({ id: todo.id, title })} />
      <View style={s.row}>
        <Button label="Save title" kind="primary" disabled={w.todoWrite.disabled} onPress={() => { void w.saveTodo(); }} />
        <Button label="Cancel" disabled={w.todoWrite.busy || w.todoWrite.uncertain} onPress={() => w.setTodoEdit(null)} />
      </View>
    </View> : <>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={todo.title} accessibilityState={{ checked: todo.status === 'COMPLETED', disabled: w.todoWrite.disabled }} disabled={w.todoWrite.disabled} onPress={() => { void w.toggleTodo(todo); }} style={styles.checkTarget}>
        <View style={[styles.checkbox, todo.status === 'COMPLETED' && styles.checked]}>{todo.status === 'COMPLETED' && <Check size={16} color={colors.surface} />}</View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${todo.title}`} disabled={w.todoWrite.disabled} style={styles.titleTarget} onPress={() => beginEdit(todo)}>
        <Text style={[s.title, todo.status === 'COMPLETED' && { color: colors.muted }]}>{todo.title}</Text>
      </Pressable>
      <IconButton icon={MoreVertical} label={`Actions for ${todo.title}`} disabled={w.todoWrite.disabled} onPress={() => Alert.alert('Todo actions', todo.title, [
        { text: 'Edit title', onPress: () => beginEdit(todo) },
        { text: 'Delete', style: 'destructive', onPress: () => w.deleteTodo(todo) },
        { text: 'Cancel', style: 'cancel' },
      ])} />
    </>}
  </View>;
  return <SafeAreaView edges={['top', 'left', 'right']} style={s.screen}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.header}>
        <View style={s.between}><Text accessibilityRole="header" style={s.heading}>Todos</Text><IconButton icon={RotateCw} label="Refresh todos" loading={w.todos.isFetching} onPress={refresh} /></View>
        <Text style={s.subtitle}>{count !== undefined ? `${count} open · ${selected?.name ?? 'Across all days'}` : 'Loading…'}</Text>
        <TodoFilterTabs filters={w.filterState.query.data ?? []} selected={w.filterState.selectedId} online={w.online} onSelect={selectFilter} />
        {w.filterState.query.isError && <View><Text style={s.error}>Could not load filters.</Text><Button label="Retry filters" onPress={() => void w.filterState.query.refetch()} /></View>}
        {w.filterState.query.isPending && <Text style={s.muted}>{w.online ? 'Loading filters…' : 'Connect to load filters.'}</Text>}
        <View style={[s.row, { marginTop: 16 }]}>
          <TextInput accessibilityLabel="New todo title" placeholder="Add a todo…" placeholderTextColor={colors.muted} style={[s.input, { flex: 1 }]} value={w.todoTitle} editable={!w.todoWrite.disabled && !w.todoEdit} onChangeText={w.setTodoTitle} returnKeyType="done" onSubmitEditing={() => { if (!w.todoEdit) void w.saveTodo(); }} />
          <IconButton icon={Plus} label="Add todo" primary disabled={w.todoWrite.disabled || !!w.todoEdit || !w.todoTitle} onPress={() => { void w.saveTodo(); }} />
        </View>
      </View>
      <ScrollView ref={scroll} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={s.content} onScroll={event => { w.saveTodoScroll(event.nativeEvent.contentOffset.y); }} scrollEventThrottle={32} onLayout={() => scroll.current?.scrollTo({ y: w.readTodoScroll(), animated: false })}>
        {!!w.todoNotice && <View><Text accessibilityLiveRegion="polite" style={s.muted}>{w.todoNotice}</Text>{w.addedOutside && <Button label="View todo" onPress={() => { w.filterState.select(''); w.setTodoEdit({ id: w.addedOutside!.id, title: w.addedOutside!.title }); w.setAddedOutside(null); w.setTodoNotice(''); }} />}<Button label="Dismiss" onPress={() => { w.setTodoNotice(''); w.setAddedOutside(null); }} /></View>}
        {retained && <Text style={s.muted}>Your editing todo is kept visible outside this filter.</Text>}
        {!w.online && <Text style={s.muted}>Offline. Showing any cached results; reconnect to refresh.</Text>}
        {selected && w.filteredTodos.isError && <View><Text style={s.error}>{filterError(w.filteredTodos.error)} Use Edit filter to check the expression.</Text><Button label="Retry filter" onPress={() => void w.filteredTodos.refetch()} /></View>}
        {selected && w.filteredTodos.isPending && <Text style={s.muted}>{w.online ? 'Filtering todos…' : 'Connect to load this filter.'}</Text>}
        {selected && w.filteredTodos.isSuccess && !visible.length && <Text style={s.muted}>No todos match this filter.</Text>}
        <WriteStatus state={w.todoWrite} online={w.online} />
        {w.todos.isError && <View><Text style={s.error}>{w.todos.error.message}</Text><Button label="Retry loading todos" onPress={refresh} /></View>}
        {w.todos.isPending && [0, 1, 2].map(key => <View key={key} accessibilityLabel="Loading todos" style={s.skeleton} />)}
        {w.todoEdit && w.todos.isSuccess && !w.todos.data.some(todo => todo.id === w.todoEdit?.id) && <View style={{ gap: 8 }}>
          <Text style={s.error}>This todo is no longer available. Your edited title is kept below.</Text>
          <TextInput accessibilityLabel="Unavailable todo draft" multiline style={s.input} value={w.todoEdit.title} editable={false} />
          <Button label="Keep title as a new draft" disabled={w.todoWrite.disabled || !!w.todoTitle} onPress={() => { w.setTodoTitle(w.todoEdit?.title ?? ''); w.setTodoEdit(null); }} />
          <Button label="Discard edited title" disabled={w.todoWrite.busy || w.todoWrite.uncertain} onPress={() => Alert.alert('Discard edited title?', 'This removes only your local draft.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => w.setTodoEdit(null) }])} />
        </View>}
        {matches && <><Text style={s.label}>Open</Text>{open.map(row)}
          {!selected && !open.length && <Text style={s.muted}>Nothing waiting. Add a todo when you need one.</Text>}
          <Pressable disabled={!!selected} accessibilityRole={selected ? 'header' : 'button'} accessibilityState={selected ? undefined : { expanded: w.completedOpen }} style={[s.row, { minHeight: 48, marginTop: 18 }]} onPress={() => w.setCompletedOpen(!w.completedOpen)}>
            {selected || w.completedOpen ? <ChevronDown color={colors.muted} size={18} /> : <ChevronRight color={colors.muted} size={18} />}<Text style={s.muted}>Completed · {completed.length}</Text>
          </Pressable>
          {(selected || w.completedOpen ? completed : completed.filter(todo => todo.id === w.todoEdit?.id)).map(row)}
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  task: { flexDirection: 'row', alignItems: 'center', minHeight: 62, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 8 },
  checkTarget: { minWidth: 44, minHeight: 48, justifyContent: 'center' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: '#A6ADA2', alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: colors.accent, borderColor: colors.accent },
  titleTarget: { flex: 1, minHeight: 48, justifyContent: 'center' },
});

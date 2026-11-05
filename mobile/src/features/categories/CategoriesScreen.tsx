import { useEffect, useRef, type ComponentRef } from 'react';
import { router } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight, RotateCw } from 'lucide-react-native';
import { categoryColors, isCategoryColor, type Category } from '../../api/categories';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { colors } from '../../theme';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { workspaceStyles as s } from '../workspace/styles';
import { WriteStatus } from '../workspace/WriteStatus';
import { categoryStyle } from './categoriesQueries';

export default function CategoriesScreen() {
  const w = useWorkspace();
  const edit = w.categoryEdit;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => { if (w.categoryWrite.error) scroll.current?.scrollTo({ y: 0, animated: true }); }, [w.categoryWrite.error]);
  function select(category?: Category) {
    const apply = () => { w.setCategoryEdit({ original: category, name: category?.name ?? '', color: category?.color ?? 'GRAY' }); w.categoryWrite.setError(''); };
    if (edit && (edit.name !== (edit.original?.name ?? '') || edit.color !== (edit.original?.color ?? 'GRAY'))) {
      Alert.alert('Discard category changes?', 'The current category has unsaved changes.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: apply }]);
    } else apply();
  }
  const back = () => { if (router.canGoBack()) router.back(); else router.replace('/'); };
  return <SafeAreaView style={s.screen}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.header}>
        <View style={s.between}><Button label="Back" onPress={back} /><IconButton icon={RotateCw} label="Refresh categories" loading={w.categories.isFetching} onPress={() => { void w.categories.refetch(); }} /></View>
        <Text accessibilityRole="header" style={s.heading}>Categories</Text>
        <Text style={s.subtitle}>Give your time a little context.</Text>
      </View>
      <ScrollView ref={scroll} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <WriteStatus state={w.categoryWrite} online={w.online} />
        {w.categories.isError && <View><Text style={s.error}>{w.categories.error.message}</Text><Button label="Retry loading categories" onPress={() => { void w.categories.refetch(); }} /></View>}
        <Button label="+  New category" disabled={w.categoryWrite.disabled} onPress={() => select()} />
        {w.categories.isPending && [0, 1, 2].map(key => <View key={key} accessibilityLabel="Loading categories" style={s.skeleton} />)}
        {w.categories.data?.length === 0 && <Text style={s.muted}>No categories yet. Add one, or Default will be created when you save your first entry.</Text>}
        {w.categories.data?.map(category => <Pressable key={category.id} accessibilityRole="button" accessibilityLabel={`Edit ${category.name}, ID ${category.id}`} disabled={w.categoryWrite.disabled} onPress={() => select(category)} style={[s.between, s.input]}>
          <Text style={{ color: categoryStyle(category.color).ink }}>●</Text><Text style={[s.title, { flex: 1 }]}>{category.name}</Text><Text style={s.muted}>#{category.id}</Text><ChevronRight size={18} color={colors.muted} />
        </Pressable>)}
        {edit && <View style={{ gap: 12 }}>
          <View style={s.separator} /><Text accessibilityRole="header" style={[s.heading, { fontSize: 22 }]}>{edit.original ? 'Edit category' : 'New category'}</Text>
          <TextInput accessibilityLabel="Category name" value={edit.name} placeholder="Category name" placeholderTextColor={colors.muted} editable={!w.categoryWrite.disabled} onChangeText={name => w.setCategoryEdit({ ...edit, name })} style={s.input} multiline />
          <Text style={s.label}>Color</Text>
          {!isCategoryColor(edit.color) && <Text style={s.muted}>Unknown color ({edit.color}). It will be kept unless you choose a color.</Text>}
          <View style={[s.row, { flexWrap: 'wrap' }]}>{categoryColors.map(color => {
            const tone = categoryStyle(color); const selected = edit.color === color;
            return <Pressable key={color} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: w.categoryWrite.disabled }} accessibilityLabel={color} disabled={w.categoryWrite.disabled} onPress={() => w.setCategoryEdit({ ...edit, color })} style={{ minWidth: 72, minHeight: 48, flexGrow: 1, padding: 10, borderRadius: 8, backgroundColor: tone.fill, borderWidth: 1, borderColor: selected ? tone.ink : 'transparent' }}>
              <Text style={{ color: tone.ink, fontSize: 13, fontWeight: '600' }}>{selected ? '✓' : '●'} {color[0] + color.slice(1).toLowerCase()}</Text>
            </Pressable>;
          })}</View>
          <Text style={s.muted}>Changes stay here when you go back. Save to apply them.</Text>
          {edit.original && <Button label="Delete category" kind="danger" disabled={w.categoryWrite.disabled} onPress={() => w.deleteCategory(edit.original!)} />}
        </View>}
      </ScrollView>
      {edit && <View style={[s.row, { padding: 16, borderTopWidth: 1, borderColor: colors.line }]}>
        <View style={{ flex: 1 }}><Button label="Save category" kind="primary" disabled={w.categoryWrite.disabled} loading={w.categoryWrite.busy} onPress={() => { void w.saveCategory(); }} /></View>
        <Button label="Cancel" disabled={w.categoryWrite.busy || w.categoryWrite.uncertain} onPress={() => { Alert.alert('Discard category changes?', 'Your unsaved category changes will be lost.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => w.setCategoryEdit(null) }]); }} />
      </View>}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

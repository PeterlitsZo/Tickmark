import { router } from 'expo-router';
import { Keyboard, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { useEntries } from '../entries/EntriesProvider';
import { categoryStyle } from './categoriesQueries';
import { workspaceStyles as s } from '../workspace/styles';

export function CategoryField({ value, disabled, error, onChoose }: { value?: string; disabled: boolean; error?: string; onChoose: () => void }) {
  const { categories } = useEntries();
  const category = categories.data?.find(item => item.id === value);
  return <View style={{ marginVertical: 8 }}>
    <View style={s.between}><Text style={s.label}>Category</Text><Button label="Manage" disabled={disabled} onPress={() => { Keyboard.dismiss(); router.push('/categories'); }} /></View>
    <View style={{ borderRadius: 10, backgroundColor: categoryStyle(category?.color).fill }}>
      <Button label={category ? `●  ${category.name}  ·  #${category.id}` : value ? 'Category unavailable · Choose another' : categories.isPending ? 'Loading categories…' : 'Choose category'} disabled={disabled || categories.isPending} onPress={onChoose} />
    </View>
    {categories.isSuccess && !categories.data.length && !value && <Text style={s.muted}>Default will be created when you save.</Text>}
    {categories.isError && <><Text style={s.error}>{categories.error.message}</Text><Button label="Retry categories" onPress={() => { void categories.refetch(); }} /></>}
    {!!error && <Text style={s.error}>{error}</Text>}
  </View>;
}

import { useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { filterHelp, helpSections, type HelpSection } from '../../../../shared/todoFilters';
import { Button } from '../../components/Button';
import { colors } from '../../theme';
export function TodoFilterHelp({ onClose, onUse }: { onClose: () => void; onUse: (expression: string) => void }) {
  const [section, setSection] = useState<HelpSection>('Examples');
  const [notice, setNotice] = useState('');
  return <View style={{ flex: 1 }}>
    <View style={s.header}><Text accessibilityRole="header" style={s.heading}>Expression guide</Text><Button label="Back to filter" onPress={onClose} /></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <Text style={s.text}>Write a condition. Todos that match it appear in this tab. Filters use saved todo values.</Text>
      <View style={s.tabs}>{helpSections.map(item => <Button key={item} label={item} kind={item === section ? 'primary' : 'plain'} onPress={() => { setSection(item); setNotice(''); }} />)}</View>
      {filterHelp[section].map(entry => <View style={s.entry} key={entry.title}>
        <Text accessibilityRole="header" style={s.title}>{entry.title}</Text><Text style={s.text}>{entry.text}</Text>
        {entry.code && <><Text selectable style={s.code}>{entry.code}</Text><View style={s.actions}>
          <Button label="Copy" onPress={() => { void Clipboard.setStringAsync(entry.code!).then(() => setNotice('Copied.'), () => setNotice('Copy unavailable. Select the expression to copy it.')); }} />
          {section === 'Examples' && <Button label="Use example" onPress={() => onUse(entry.code!)} />}
        </View></>}
      </View>)}
      <Text accessibilityLiveRegion="polite" style={s.text}>{notice}</Text>
      <Text style={s.text}>Examples replace the expression; they do not save the tab.</Text>
    </ScrollView>
  </View>;
}
const s = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', borderBottomWidth: 1, borderColor: colors.line },
  heading: { color: colors.ink, fontSize: 20, fontWeight: '600' },
  content: { padding: 20, gap: 16 }, tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  entry: { paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line, gap: 8 },
  title: { color: colors.ink, fontWeight: '600', fontSize: 16 }, text: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  code: { backgroundColor: colors.surface, color: colors.ink, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 6, fontSize: 14, lineHeight: 22 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
});

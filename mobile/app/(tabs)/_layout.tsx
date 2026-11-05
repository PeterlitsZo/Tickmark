import { Tabs } from 'expo-router';
import { CalendarDays, SquareCheck } from 'lucide-react-native';
import { View } from 'react-native';
import { colors } from '../../src/theme';

export default function TabLayout() {
  return <Tabs backBehavior="history" screenOptions={{
    headerShown: false,
    tabBarHideOnKeyboard: true,
    tabBarActiveTintColor: colors.accent,
    tabBarInactiveTintColor: colors.muted,
    tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
    tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
  }}>
    <Tabs.Screen name="index" options={{ title: 'Calendar', tabBarIcon: ({ color, focused }) => <View style={{ backgroundColor: focused ? colors.block : 'transparent', paddingHorizontal: 18, paddingVertical: 4, borderRadius: 12 }}><CalendarDays color={color} size={22} /></View> }} />
    <Tabs.Screen name="todos" options={{ title: 'Todos', tabBarIcon: ({ color, focused }) => <View style={{ backgroundColor: focused ? colors.block : 'transparent', paddingHorizontal: 18, paddingVertical: 4, borderRadius: 12 }}><SquareCheck color={color} size={22} /></View> }} />
  </Tabs>;
}

import { Tabs } from "expo-router/tabs";
import { Text, type ColorValue } from "react-native";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme";

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;

export default function TabsLayout() {
  const t = useTheme();
  const { compare } = useStore();
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: t.accent, tabBarInactiveTintColor: t.muted,
      tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line },
      headerStyle: { backgroundColor: t.surface }, headerTintColor: t.ink, sceneStyle: { backgroundColor: t.bg },
    }}>
      <Tabs.Screen name="index" options={{ title: "Підбір", headerTitle: "AutoWise", tabBarIcon: icon("◎") }} />
      <Tabs.Screen name="catalog" options={{ title: "Каталог", tabBarIcon: icon("☰") }} />
      <Tabs.Screen name="compare" options={{ title: "Порівняння", tabBarIcon: icon("⇆"), tabBarBadge: compare.length || undefined }} />
      <Tabs.Screen name="tco" options={{ title: "Витрати", tabBarIcon: icon("₴") }} />
      <Tabs.Screen name="account" options={{ title: "Кабінет", tabBarIcon: icon("◉") }} />
    </Tabs>
  );
}

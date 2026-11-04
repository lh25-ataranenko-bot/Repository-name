import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider } from "@/components/ui";
import { StoreProvider } from "@/lib/store";
import { useTheme } from "@/lib/theme";

export default function RootLayout() {
  const t = useTheme();
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <ToastProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerStyle: { backgroundColor: t.surface }, headerTintColor: t.ink, contentStyle: { backgroundColor: t.bg }, headerBackTitle: "Назад" }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="car/[slug]" options={{ title: "Модифікація" }} />
            <Stack.Screen name="check" options={{ title: "Аналіз оголошення" }} />
            <Stack.Screen name="rating" options={{ title: "Рейтинг" }} />
            <Stack.Screen name="account/reset" options={{ title: "Новий пароль" }} />
            <Stack.Screen name="account/verify" options={{ title: "Підтвердження пошти" }} />
          </Stack>
        </ToastProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}

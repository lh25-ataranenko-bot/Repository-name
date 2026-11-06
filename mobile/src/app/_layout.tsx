import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider } from "@/components/ui";
import { StoreProvider } from "@/lib/store";
import { configureNotifications } from "@/lib/serviceReminders";
import { useTheme } from "@/lib/theme";

configureNotifications();

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
            <Stack.Screen name="assistant" options={{ title: "AI-помічник" }} />
            <Stack.Screen name="customs" options={{ title: "Розмитнення" }} />
            <Stack.Screen name="brands" options={{ title: "Марки й моделі" }} />
            <Stack.Screen name="brand/[name]" options={{ title: "Марка" }} />
            <Stack.Screen name="model" options={{ title: "Модель" }} />
            <Stack.Screen name="account/reset" options={{ title: "Новий пароль" }} />
            <Stack.Screen name="account/verify" options={{ title: "Підтвердження пошти" }} />
          </Stack>
        </ToastProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}

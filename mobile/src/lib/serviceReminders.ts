/**
 * Local reminders for the next service: one notification a week before the due date of each garage car.
 * Rescheduled every time the garage is loaded, so new entries and intervals are picked up.
 * The mileage limit cannot be predicted by date, so it is only mentioned in the text.
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { GarageCar } from "./types";

const WEEK = 7 * 24 * 3600 * 1000;

export async function scheduleServiceReminders(cars: GarageCar[]): Promise<void> {
  if (Platform.OS === "web" || !cars.length) return;
  try {
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("service", { name: "Нагадування про ТО", importance: Notifications.AndroidImportance.DEFAULT });
    }
    for (const g of cars) {
      const id = `service-${g.id}`;
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => null);
      const due = new Date(`${g.service.due_date}T10:00:00`);
      const at = new Date(due.getTime() - WEEK);
      if (at.getTime() <= Date.now()) continue; // already within a week or overdue: the garage screen shows it
      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: {
          title: `Скоро ТО: ${g.name}`,
          body: `Наступне ТО до ${due.toLocaleDateString("uk-UA")} або на ${g.service.due_km.toLocaleString("uk-UA")} км — що настане раніше.`,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: "service" },
      });
    }
  } catch {
    // Notifications unavailable (e.g. no permission on this device): the reminder is still shown in the garage.
  }
}

export function configureNotifications(): void {
  if (Platform.OS === "web") return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

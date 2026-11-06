import type { Car } from "./types";

export const nf = (n: number | null | undefined, d = 0) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("uk-UA", { minimumFractionDigits: d, maximumFractionDigits: d });

export const usd = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : (n < 0 ? "−$" : "$") + nf(Math.abs(Math.round(n)));

export const nameOf = (c: Pick<Car, "brand" | "model" | "name">) => `${c.brand} ${c.model} ${c.name}`;
export const shortOf = (c: Pick<Car, "model" | "name">) => `${c.model} ${c.name}`;
/** The catalogue covers cars from this year to next year (new model years are sold in advance). */
export const MIN_YEAR = 1990;
export const thisYear = () => new Date().getFullYear();
/** «2018–2021», or «2021–досі» for a modification still in production. */
export const span = (from: number | null | undefined, to: number | null | undefined, inProduction?: boolean) =>
  from ? `${from}–${inProduction ? "досі" : to ?? "—"}` : "—";
export const years = (c: Pick<Car, "year_from" | "year_to" | "in_production">) => span(c.year_from, c.year_to, c.in_production);
export const isEV = (c: Pick<Car, "fuel">) => c.fuel === "electric";
export const consUnit = (c: Pick<Car, "fuel">) => (isEV(c) ? "кВт·год/100 км" : "л/100 км");
export const yearsWord = (y: number) => (y === 1 ? "рік" : y < 5 ? "роки" : "років");

export const COLORS_KEYS = ["c1", "c2", "c3", "c4", "c5"] as const;

export const FUEL: Record<string, string> = { petrol: "Бензин", diesel: "Дизель", hybrid: "Гібрид", electric: "Електро" };
export const BODY: Record<string, string> = { sedan: "Седан", liftback: "Ліфтбек", crossover: "Кросовер", hatch: "Хетчбек", wagon: "Універсал", minivan: "Мінівен", van: "Фургон", pickup: "Пікап", coupe: "Купе", cabrio: "Кабріолет / родстер" };
export const DRIVE: Record<string, string> = { FWD: "Передній", RWD: "Задній", AWD: "Повний" };
export const ASSIST: Record<string, string> = {
  AEB: "Автоматичне гальмування", LKA: "Утримання смуги", ACC: "Адаптивний круїз",
  BSM: "Контроль сліпих зон", RCTA: "Попередження при виїзді заднім ходом",
};
export const STATUS: Record<string, [string, string]> = {
  verified: ["Перевірено", "good"], partial: ["Частково перевірено", "warn"], unverified: ["Не перевірено", "bad"],
};
export const CATS: [import("./types").CategoryKey, string][] = [
  ["economy", "Економічність"], ["dynamics", "Динаміка"], ["reliability", "Надійність"], ["comfort", "Комфорт"],
  ["safety", "Безпека"], ["practicality", "Практичність"], ["tco", "Вартість володіння"],
];
export const PRESETS: Record<string, string> = {
  balanced: "Збалансовано", city: "Місто", highway: "Траса", family: "Сім’я", sport: "Активне водіння", budget: "Мінімальні витрати",
};

import { useColorScheme } from "react-native";

// Same palette as the website: cool slate neutrals, cobalt accent, amber "needle" for highlights.
const light = {
  bg: "#ECEFF3", surface: "#FFFFFF", surface2: "#F4F6F9", ink: "#111922", muted: "#566273", line: "#D2D9E1",
  accent: "#1946C7", accentInk: "#FFFFFF", accentSoft: "#E2E9FB", needle: "#D98E00", needleSoft: "#FFF1D2",
  good: "#167A4A", goodSoft: "#DFF2E7", warn: "#995800", warnSoft: "#FCEFD9", bad: "#B42318", badSoft: "#FBE5E2",
  c1: "#1946C7", c2: "#D98E00", c3: "#0E8F84", c4: "#B8327A", c5: "#5E6A7A",
};
const dark: typeof light = {
  bg: "#0C1117", surface: "#141B24", surface2: "#1A232E", ink: "#E6EBF1", muted: "#97A3B2", line: "#283444",
  accent: "#7EA2FF", accentInk: "#0C1117", accentSoft: "#1B2A4D", needle: "#FFBE3B", needleSoft: "#3A2C0E",
  good: "#4CC38A", goodSoft: "#12301F", warn: "#F0B35A", warnSoft: "#382810", bad: "#FF7F73", badSoft: "#3B1714",
  c1: "#7EA2FF", c2: "#FFBE3B", c3: "#3FC7B8", c4: "#EE77B4", c5: "#A6B1BF",
};
export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}

export const seriesColor = (t: Theme, i: number) => [t.c1, t.c2, t.c3, t.c4, t.c5][i % 5];

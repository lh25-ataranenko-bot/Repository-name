import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type PressableProps, type TextInputProps, type TextProps, type ViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { CATS } from "@/lib/format";
import { seriesColor, useTheme } from "@/lib/theme";
import type { Scores } from "@/lib/types";

/* ---------- text ---------- */
type Variant = "h1" | "h2" | "h3" | "body" | "small" | "muted" | "label" | "eyebrow" | "num";
export function T({ v = "body", style, ...p }: TextProps & { v?: Variant }) {
  const t = useTheme();
  const base = {
    h1: { fontSize: 26, fontWeight: "800" as const, color: t.ink, lineHeight: 31 },
    h2: { fontSize: 20, fontWeight: "700" as const, color: t.ink },
    h3: { fontSize: 16, fontWeight: "700" as const, color: t.ink },
    body: { fontSize: 15, color: t.ink, lineHeight: 21 },
    small: { fontSize: 13, color: t.ink, lineHeight: 18 },
    muted: { fontSize: 13, color: t.muted, lineHeight: 18 },
    label: { fontSize: 12, color: t.muted, fontWeight: "600" as const },
    eyebrow: { fontSize: 11, color: t.muted, letterSpacing: 1, textTransform: "uppercase" as const },
    num: { fontSize: 22, fontWeight: "800" as const, color: t.ink, fontVariant: ["tabular-nums" as const] },
  }[v];
  return <Text {...p} style={[base, style]} />;
}

/* ---------- layout ---------- */
export function Screen({ children, refresh }: { children: ReactNode; refresh?: ReactNode }) {
  const t = useTheme();
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      {refresh}
      {children}
    </ScrollView>
  );
}

export function Card({ style, ...p }: ViewProps) {
  const t = useTheme();
  return <View {...p} style={[{ backgroundColor: t.surface, borderColor: t.line, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14, gap: 10 }, style]} />;
}

export function Row({ style, ...p }: ViewProps) {
  return <View {...p} style={[{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }, style]} />;
}

/* ---------- controls ---------- */
export function Button({ title, kind = "default", small, style, ...p }: PressableProps & { title: string; kind?: "default" | "primary" | "ghost"; small?: boolean }) {
  const t = useTheme();
  const bg = kind === "primary" ? t.accent : kind === "ghost" ? "transparent" : t.surface;
  const fg = kind === "primary" ? t.accentInk : kind === "ghost" ? t.muted : t.ink;
  return (
    <Pressable
      accessibilityRole="button"
      {...p}
      style={({ pressed }) => [{
        backgroundColor: bg, borderColor: kind === "primary" ? t.accent : kind === "ghost" ? "transparent" : t.line, borderWidth: 1,
        borderRadius: 8, paddingVertical: small ? 6 : 10, paddingHorizontal: small ? 10 : 14, alignItems: "center",
        opacity: p.disabled ? 0.45 : pressed ? 0.75 : 1,
      }, style as object]}
    >
      <Text style={{ color: fg, fontWeight: "600", fontSize: small ? 13 : 14 }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress?: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} onPress={onPress}
      style={{ paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accentSoft : t.surface2 }}>
      <Text style={{ color: t.ink, fontSize: 13, fontWeight: "500" }}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, style, ...p }: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={[{ gap: 4, flexGrow: 1, minWidth: 140 }, style as object]}>
      <T v="label">{label}</T>
      <TextInput placeholderTextColor={t.muted} accessibilityLabel={label} {...p}
        style={{ borderWidth: 1, borderColor: t.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: t.ink, backgroundColor: t.surface, fontSize: 15 }} />
    </View>
  );
}

export function Pill({ text, tone = "plain" }: { text: string; tone?: "good" | "warn" | "bad" | "info" | "plain" }) {
  const t = useTheme();
  const c = { good: [t.goodSoft, t.good], warn: [t.warnSoft, t.warn], bad: [t.badSoft, t.bad], info: [t.accentSoft, t.accent], plain: [t.surface2, t.muted] }[tone];
  return <Text style={{ backgroundColor: c[0], color: c[1], fontSize: 12, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: "hidden", alignSelf: "flex-start" }}>{text}</Text>;
}

export function Notice({ children, tone = "warn" }: { children: ReactNode; tone?: "warn" | "info" }) {
  const t = useTheme();
  return (
    <View style={{ borderLeftWidth: 3, borderLeftColor: tone === "warn" ? t.warn : t.accent, backgroundColor: tone === "warn" ? t.warnSoft : t.accentSoft, padding: 12, borderTopRightRadius: 8, borderBottomRightRadius: 8 }}>
      <T v="small">{children}</T>
    </View>
  );
}

export function Loading({ error }: { error?: string | null }) {
  const t = useTheme();
  return error ? <T style={{ color: t.bad }}>{error}</T> : <ActivityIndicator color={t.accent} style={{ marginVertical: 24 }} />;
}

export const ND = "Немає даних";

/* ---------- charts ---------- */
export function Bar({ value, color, height = 8 }: { value: number | null; color?: string; height?: number }) {
  const t = useTheme();
  return (
    <View style={{ height, backgroundColor: t.surface2, borderRadius: 4, overflow: "hidden", flex: 1 }}>
      {value != null && <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: "100%", backgroundColor: color ?? t.accent, borderRadius: 4 }} />}
    </View>
  );
}

export function ScoreBars({ series }: { series: Scores[] }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10 }}>
      {CATS.map(([k, label]) => (
        <View key={k} style={{ gap: 4 }}>
          <T v="small">{label}</T>
          {series.map((s, i) => (
            <Row key={i} style={{ flexWrap: "nowrap" }}>
              <Bar value={s[k]} color={series.length > 1 ? seriesColor(t, i) : t.accent} height={10} />
              <T v="small" style={{ width: 30, textAlign: "right", fontWeight: "700" }}>{s[k] ?? "—"}</T>
            </Row>
          ))}
        </View>
      ))}
    </View>
  );
}

const SIL: Record<string, { b: string; w: number[] }> = {
  sedan: { b: "M8 58 C8 51 12 47 22 46 L56 42 L79 28 C83 25 87 24 93 24 L125 24 C131 24 135 26 139 29 L157 42 L183 46 C189 47 192 51 192 57 L192 62 L8 62 Z", w: [50, 150] },
  liftback: { b: "M8 58 C8 51 12 47 22 46 L56 42 L81 27 C85 24 89 23 95 23 L121 23 C127 23 131 25 137 28 L171 44 L184 47 C189 48 192 52 192 57 L192 62 L8 62 Z", w: [50, 150] },
  crossover: { b: "M10 58 L10 44 C10 39 14 37 20 36 L44 34 L64 18 C67 16 71 15 77 15 L143 15 C149 15 153 17 156 20 L170 33 L184 36 C189 37 192 41 192 47 L192 62 L10 62 Z", w: [50, 152] },
  hatch: { b: "M14 58 L14 46 C14 41 18 39 24 38 L50 36 L72 19 C75 17 78 16 84 16 L144 16 C150 16 153 18 155 22 L164 41 L170 44 C173 46 174 50 174 55 L174 62 L14 62 Z", w: [48, 144] },
  wagon: { b: "M8 58 C8 51 12 47 22 46 L56 42 L80 26 C84 24 88 23 94 23 L172 23 C177 23 180 26 182 31 L188 46 C191 48 192 52 192 57 L192 62 L8 62 Z", w: [50, 150] },
  minivan: { b: "M10 58 L10 40 C10 34 14 32 20 31 L40 29 L58 14 C61 12 65 11 71 11 L176 11 C182 11 186 14 187 19 L190 40 C191 46 192 50 192 56 L192 62 L10 62 Z", w: [46, 156] },
  van: { b: "M8 58 L8 40 C8 34 12 31 18 30 L34 28 L46 10 C48 8 51 7 55 7 L186 7 C190 7 192 9 192 13 L192 62 L8 62 Z", w: [44, 158] },
  pickup: { b: "M8 58 L8 44 C8 39 12 37 18 36 L40 34 L58 16 C61 14 64 13 70 13 L112 13 C116 13 118 15 118 19 L118 36 L192 36 L192 62 L8 62 Z", w: [46, 156] },
};
export function Silhouette({ body, width = 120 }: { body: string; width?: number }) {
  const t = useTheme();
  const s = SIL[body] ?? SIL.sedan;
  return (
    <Svg width={width} height={(width * 76) / 200} viewBox="0 0 200 76">
      <Line x1="2" y1="72.5" x2="198" y2="72.5" stroke={t.line} strokeWidth={1.5} />
      <Path d={s.b} fill={t.accentSoft} stroke={t.accent} strokeWidth={1.5} />
      {s.w.map((x) => [<Circle key={`t${x}`} cx={x} cy={62} r={11} fill={t.ink} />, <Circle key={`h${x}`} cx={x} cy={62} r={5} fill={t.surface2} />])}
    </Svg>
  );
}

/* ---------- toast ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2400);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <View pointerEvents="none" style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 70, alignItems: "center" }}>
          <Text accessibilityLiveRegion="polite" style={{ backgroundColor: t.ink, color: t.bg, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, overflow: "hidden", fontSize: 14 }}>{msg}</Text>
        </View>
      )}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

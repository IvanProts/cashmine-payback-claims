import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

// Light fintech palette: ink + lime accent, soft tinted states. Presentation only.
export const colors = {
  bg: '#F3F4F6',
  card: '#FFFFFF',
  text: '#0E0F0C',
  muted: '#60646C',
  faint: '#9AA0A8',
  border: '#E6E8EC',
  soft: '#EEF0F3',
  primary: '#0E0F0C',
  link: '#1F5FE0',
  accent: '#9FE870',
  accentInk: '#163300',
  danger: '#C62B33',
  dangerBg: '#FDECEC',
  warnBg: '#FFF3D4',
  warn: '#8A5A00',
  okBg: '#E2F6E9',
  ok: '#0B7A3E',
  infoBg: '#E8EEFD',
  info: '#2A4FB8',
};

export const num = { fontVariant: ['tabular-nums' as const] };

export function Button(props: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'accent' | 'secondary' | 'danger' | 'link';
  size?: 'md' | 'sm';
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const kind = props.kind ?? 'primary';
  const sm = props.size === 'sm';
  const fg = { primary: '#fff', accent: colors.accentInk, secondary: colors.text, danger: '#fff', link: colors.link }[kind];
  const bg = {
    primary: colors.primary,
    accent: colors.accent,
    secondary: colors.soft,
    danger: colors.danger,
    link: 'transparent',
  }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [
        s.btn,
        sm && s.btnSm,
        { backgroundColor: bg },
        pressed && { opacity: 0.8 },
        props.disabled && { opacity: 0.4 },
        props.style,
      ]}
    >
      <Text style={{ color: fg, fontWeight: '700', fontSize: sm ? 14 : 16 }}>{props.label}</Text>
    </Pressable>
  );
}

export function Card(props: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, props.style]}>{props.children}</View>;
}

/** Soft, compact notice. Used sparingly; routine states use inline lines or status rows instead. */
export function Banner(props: { tone: 'error' | 'warn' | 'ok' | 'info'; children: React.ReactNode }) {
  const t = {
    error: [colors.dangerBg, colors.danger],
    warn: [colors.warnBg, colors.warn],
    ok: [colors.okBg, colors.ok],
    info: [colors.infoBg, colors.info],
  }[props.tone];
  return (
    <View style={[s.banner, { backgroundColor: t[0] }]}>
      <View style={[s.dot, { backgroundColor: t[1] }]} />
      <Text style={{ color: t[1], fontSize: 13, lineHeight: 18, flex: 1 }}>{props.children}</Text>
    </View>
  );
}

const AVATARS = [
  ['#E3EEFF', '#1F4FBF'],
  ['#FFEFD6', '#9A5B00'],
  ['#E6F6E8', '#17703A'],
  ['#F3E8FF', '#6B2FB3'],
  ['#FFE8EC', '#B3243D'],
];
export function Avatar(props: { asset: string; size?: number }) {
  const size = props.size ?? 40;
  let h = 0;
  for (const ch of props.asset) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, fg] = AVATARS[h % AVATARS.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: fg, fontWeight: '800', fontSize: size * 0.34 }}>{props.asset.slice(0, 2)}</Text>
    </View>
  );
}

export const text = StyleSheet.create({
  h1: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  h2: { fontSize: 17, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  label: { fontSize: 12, fontWeight: '600', color: colors.muted, letterSpacing: 0.3 },
  mono: { fontSize: 13, color: colors.text, fontFamily: 'monospace' },
});

const s = StyleSheet.create({
  btn: { minHeight: 52, paddingHorizontal: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  btnSm: { minHeight: 34, paddingHorizontal: 14, borderRadius: 17 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  banner: { borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 10, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
});

import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

export const colors = {
  bg: '#f4f5f7',
  card: '#ffffff',
  text: '#111827',
  muted: '#6b7280',
  border: '#e5e7eb',
  primary: '#2563eb',
  danger: '#b91c1c',
  dangerBg: '#fee2e2',
  warnBg: '#fef3c7',
  warn: '#92400e',
  okBg: '#dcfce7',
  ok: '#166534',
  infoBg: '#dbeafe',
  info: '#1e3a8a',
};

export function Button(props: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'link';
  size?: 'md' | 'sm';
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const kind = props.kind ?? 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      disabled={props.disabled}
      style={[
        s.btn,
        props.size === 'sm' && s.btnSm,
        kind === 'primary' && { backgroundColor: colors.primary },
        kind === 'danger' && { backgroundColor: colors.danger },
        kind === 'secondary' && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
        kind === 'link' && { backgroundColor: 'transparent' },
        props.disabled && { opacity: 0.45 },
        props.style,
      ]}
    >
      <Text
        style={[
          s.btnText,
          props.size === 'sm' && { fontSize: 14 },
          kind === 'secondary' && { color: colors.text },
          kind === 'link' && { color: colors.primary },
        ]}
      >{props.label}</Text>
    </Pressable>
  );
}

export function Card(props: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, props.style]}>{props.children}</View>;
}

export function Banner(props: { tone: 'error' | 'warn' | 'ok' | 'info'; children: React.ReactNode }) {
  const t = {
    error: [colors.dangerBg, colors.danger],
    warn: [colors.warnBg, colors.warn],
    ok: [colors.okBg, colors.ok],
    info: [colors.infoBg, colors.info],
  }[props.tone];
  return (
    <View style={[s.banner, { backgroundColor: t[0] }]}>
      <Text style={{ color: t[1], fontSize: 14 }}>{props.children}</Text>
    </View>
  );
}

export const text = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '700', color: colors.text },
  h2: { fontSize: 17, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  mono: { fontSize: 13, color: colors.text, fontFamily: 'monospace' },
});

const s = StyleSheet.create({
  btn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnSm: { minHeight: 36, paddingHorizontal: 12, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
  },
  banner: { borderRadius: 10, padding: 10, marginBottom: 8 },
});

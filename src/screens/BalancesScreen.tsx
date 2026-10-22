import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ApiError, Balances } from '../lib/api';
import { D, formatUsd, plain, totalUsd, usdValue } from '../lib/money';
import { Avatar, Banner, Button, Card, colors, num, text } from '../ui';

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function Chip(props: { label: string; tone?: 'warn' }) {
  return (
    <View style={{ backgroundColor: props.tone === 'warn' ? colors.warnBg : colors.soft, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={[{ fontSize: 12, fontWeight: '600', color: props.tone === 'warn' ? colors.warn : colors.muted }, num]}>{props.label}</Text>
    </View>
  );
}

export function BalancesScreen(props: {
  data: Balances | null;
  error: Error | null;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onClaim: (asset: string) => void;
  onChangeToken: () => void;
  claimInProgress: boolean;
  syncing: boolean; // a settled claim is not yet reconciled with a newer server snapshot
}) {
  const now = useNow();
  const { data, error } = props;
  const unauthorized = error instanceof ApiError && error.status === 401;

  if (props.loading && !data) {
    return (
      <View style={{ padding: 40, alignItems: 'center' }}>
        <ActivityIndicator />
        <Text style={[text.muted, { marginTop: 8 }]}>Loading balances…</Text>
      </View>
    );
  }

  const age = data ? now - new Date(data.asOf).getTime() : 0;
  const stale = props.claimInProgress || props.syncing;
  const outdated = age > 45000;
  const dot = stale || outdated || error ? '#F5B83D' : colors.accent;

  return (
    <View>
      {error && (
        <Banner tone="error">
          {unauthorized
            ? 'Your token is missing, invalid or expired.'
            : `Could not refresh balances: ${error.message}.${data ? ' Showing the last snapshot; retrying automatically while a claim is syncing.' : ''}`}
        </Banner>
      )}
      {unauthorized && <Button label="Change token" onPress={props.onChangeToken} style={{ marginBottom: 12 }} />}
      {/* The only Retry/Refresh control lives in the hero card; this covers the "no snapshot yet" case. */}
      {error && !unauthorized && !data && (
        <Button label="Retry" onPress={props.onRefresh} disabled={props.refreshing} style={{ marginBottom: 12 }} />
      )}

      {data && (
        <>
          <View style={{ backgroundColor: colors.primary, borderRadius: 24, padding: 20, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: '#B8BDC4', fontSize: 13, fontWeight: '600' }}>Total claimable</Text>
              <Pressable
                onPress={props.onRefresh}
                disabled={props.refreshing}
                accessibilityRole="button"
                style={{ backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, opacity: props.refreshing ? 0.6 : 1 }}
              >
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                  {props.refreshing ? 'Refreshing…' : error ? 'Retry' : '↻ Refresh'}
                </Text>
              </Pressable>
            </View>
            <Text style={[{ fontSize: 38, fontWeight: '800', color: '#fff', letterSpacing: -1, marginTop: 6 }, num]}>
              {formatUsd(totalUsd(data.items))}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot, marginRight: 8 }} />
              <Text style={{ color: '#B8BDC4', fontSize: 12, flex: 1 }}>
                Updated {ago(age)} · {new Date(data.asOf).toLocaleTimeString()}
                {outdated ? ' · may be outdated' : ''}
              </Text>
            </View>
            {stale && (
              <Text style={{ color: '#F5D58A', fontSize: 12, marginTop: 6, lineHeight: 17 }}>
                {props.claimInProgress
                  ? 'Claim in progress — this snapshot may not include it yet.'
                  : 'Balance syncing — waiting for a snapshot newer than your claim. Figures may be outdated.'}
              </Text>
            )}
          </View>

          <Text style={[text.label, { marginLeft: 4, marginBottom: 8 }]}>ASSETS</Text>
          {data.items.length === 0 && <Text style={text.muted}>No assets yet.</Text>}
          <Card style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
            {data.items.map((i, idx) => {
              const hasPending = new D(i.pending).gt(0);
              const hasClaiming = new D(i.claiming).gt(0);
              return (
                <View
                  key={i.asset}
                  style={{ paddingVertical: 14, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: colors.border }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Avatar asset={i.asset} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={text.h2}>{i.asset}</Text>
                      <Text style={[text.muted, num]}>${plain(i.usdPrice)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[{ fontSize: 17, fontWeight: '700', color: colors.text }, num]}>
                        {plain(i.available)} {i.asset}
                      </Text>
                      <Text style={[text.muted, num]}>≈ {formatUsd(usdValue(i.available, i.usdPrice))}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1, marginRight: 8 }}>
                      {hasPending && <Chip label={`Pending ${plain(i.pending)} ${i.asset}`} />}
                      {hasClaiming && (
                        <Chip label={`Claiming ${plain(i.claiming)} ${i.asset}${stale ? ' · may be outdated' : ''}`} tone="warn" />
                      )}
                    </View>
                    <Button label="Claim" kind="accent" size="sm" onPress={() => props.onClaim(i.asset)} />
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      )}
    </View>
  );
}

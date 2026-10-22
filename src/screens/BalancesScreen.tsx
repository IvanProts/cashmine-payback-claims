import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { ApiError, Balances } from '../lib/api';
import { formatUsd, plain, totalUsd, usdValue } from '../lib/money';
import { Banner, Button, Card, colors, text } from '../ui';

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
      <View style={{ padding: 24, alignItems: 'center' }}>
        <ActivityIndicator />
        <Text style={[text.muted, { marginTop: 8 }]}>Loading balances…</Text>
      </View>
    );
  }

  const age = data ? now - new Date(data.asOf).getTime() : 0;
  const stale = props.claimInProgress || props.syncing;

  return (
    <View>
      {error && (
        <Banner tone="error">
          {unauthorized
            ? 'Your token is missing, invalid or expired.'
            : `Could not refresh balances: ${error.message}.${data ? ' Showing the last snapshot; retrying automatically while a claim is syncing.' : ''}`}
        </Banner>
      )}
      {unauthorized && <Button label="Change token" onPress={props.onChangeToken} style={{ marginBottom: 8 }} />}
      {/* The only Retry/Refresh control lives in the total card; this covers the "no snapshot yet" case. */}
      {error && !unauthorized && !data && (
        <Button label="Retry" onPress={props.onRefresh} disabled={props.refreshing} style={{ marginBottom: 8 }} />
      )}

      {data && (
        <>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={text.muted}>Total claimable (available)</Text>
              <Button
                label={props.refreshing ? 'Refreshing…' : error ? 'Retry' : 'Refresh'}
                kind="secondary"
                size="sm"
                onPress={props.onRefresh}
                disabled={props.refreshing}
              />
            </View>
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text, marginVertical: 2 }}>
              {formatUsd(totalUsd(data.items))}
            </Text>
            <Text style={[text.muted, age > 45000 && { color: colors.warn, fontWeight: '600' }]}>
              Snapshot as of {new Date(data.asOf).toLocaleTimeString()} ({ago(age)}
              {age > 45000 ? ' – may be outdated' : ''})
            </Text>
            {stale && (
              <Text style={{ color: colors.info, fontSize: 13, marginTop: 4 }}>
                {props.claimInProgress
                  ? 'Claim in progress — this snapshot may not include it yet.'
                  : 'Balance syncing — waiting for a snapshot newer than your claim. Figures may be outdated.'}
              </Text>
            )}
          </Card>

          {data.items.length === 0 && <Text style={text.muted}>No assets yet.</Text>}
          {data.items.map((i) => (
            <Card key={i.asset}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={text.h2}>{i.asset}</Text>
                  <Text style={text.muted}>${plain(i.usdPrice)} / unit</Text>
                </View>
                <Button label="Claim" size="sm" onPress={() => props.onClaim(i.asset)} />
              </View>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 4 }}>
                {plain(i.available)} {i.asset} <Text style={text.muted}>available</Text>
              </Text>
              <Text style={text.muted}>≈ {formatUsd(usdValue(i.available, i.usdPrice))}</Text>
              <Text style={[text.muted, { marginTop: 4 }]}>
                Pending: {plain(i.pending)} {i.asset} · Claiming: {plain(i.claiming)} {i.asset}
                {stale ? ' (may be outdated)' : ''}
              </Text>
            </Card>
          ))}
        </>
      )}
    </View>
  );
}

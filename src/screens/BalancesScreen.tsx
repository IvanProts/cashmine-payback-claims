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
}) {
  const now = useNow();
  const { data, error } = props;
  const unauthorized = error instanceof ApiError && error.status === 401;

  if (props.loading && !data) {
    return (
      <View style={{ padding: 32, alignItems: 'center' }}>
        <ActivityIndicator />
        <Text style={[text.muted, { marginTop: 8 }]}>Loading balances…</Text>
      </View>
    );
  }

  const age = data ? now - new Date(data.asOf).getTime() : 0;

  return (
    <View>
      {error && (
        <Banner tone="error">
          {unauthorized
            ? 'Your token is missing, invalid or expired. Change the token to continue.'
            : `Could not load balances: ${error.message}.${data ? ' Showing the last successful snapshot.' : ''}`}
        </Banner>
      )}
      {error && unauthorized && <Button label="Change token" onPress={props.onChangeToken} style={{ marginBottom: 12 }} />}
      {error && !unauthorized && (
        <Button label="Retry" kind="secondary" onPress={props.onRefresh} disabled={props.refreshing} style={{ marginBottom: 12 }} />
      )}

      {data && (
        <>
          <Card>
            <Text style={text.muted}>Total claimable (available) value</Text>
            <Text style={{ fontSize: 30, fontWeight: '700', color: colors.text, marginVertical: 4 }}>
              {formatUsd(totalUsd(data.items))}
            </Text>
            <Text style={[text.muted, age > 45000 && { color: colors.warn, fontWeight: '600' }]}>
              Snapshot as of {new Date(data.asOf).toLocaleTimeString()} ({ago(age)}
              {age > 45000 ? ' – may be outdated' : ''})
            </Text>
            <Button
              label={props.refreshing ? 'Refreshing…' : 'Refresh'}
              kind="secondary"
              onPress={props.onRefresh}
              disabled={props.refreshing}
              style={{ marginTop: 10 }}
            />
          </Card>

          {props.claimInProgress && (
            <Banner tone="info">
              A claim is in progress. Balances are server snapshots (refreshed about every 15 s), so the claim may not
              be reflected here yet.
            </Banner>
          )}

          {data.items.length === 0 && <Text style={text.muted}>No assets yet.</Text>}
          {data.items.map((i) => (
            <Card key={i.asset}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={text.h2}>{i.asset}</Text>
                <Text style={text.muted}>${plain(i.usdPrice)} / unit</Text>
              </View>
              <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 6 }}>
                {plain(i.available)} <Text style={text.muted}>available</Text>
              </Text>
              <Text style={text.muted}>≈ {formatUsd(usdValue(i.available, i.usdPrice))}</Text>
              <View style={{ marginTop: 6 }}>
                <Text style={text.muted}>Pending (unconfirmed): {plain(i.pending)}</Text>
                <Text style={text.muted}>Claiming (in unfinished claims): {plain(i.claiming)}</Text>
              </View>
              <Button label={`Claim ${i.asset}`} onPress={() => props.onClaim(i.asset)} style={{ marginTop: 10 }} />
            </Card>
          ))}
        </>
      )}
    </View>
  );
}

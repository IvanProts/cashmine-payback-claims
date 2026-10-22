import React, { useEffect, useRef, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { clearToken, loadGate, loadToken, saveGate, saveToken, tokenTag } from './src/lib/storage';
import { BalancesScreen } from './src/screens/BalancesScreen';
import { ClaimScreen } from './src/screens/ClaimScreen';
import { ClaimStatus } from './src/screens/ClaimStatus';
import { TokenScreen } from './src/screens/TokenScreen';
import { ensureGate, isExpired, isReconciled, restoreGate, StoredGate } from './src/lib/sync';
import { useClaimAttempt } from './src/useClaimAttempt';
import { useBalances } from './src/useBalances';
import { Button, colors, text } from './src/ui';

export default function App() {
  const [token, setToken] = useState<string | null>(() => loadToken());
  const [editingToken, setEditingToken] = useState(false);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {!token || editingToken ? (
            <TokenScreen
              hasToken={!!token}
              onSave={(t) => {
                saveToken(t);
                setToken(t);
                setEditingToken(false);
              }}
              onCancel={() => setEditingToken(false)}
              onForget={() => {
                clearToken();
                setToken(null);
                setEditingToken(false);
              }}
            />
          ) : (
            <Main key={tokenTag(token)} token={token} onChangeToken={() => setEditingToken(true)} />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Main(props: { token: string; onChangeToken: () => void }) {
  const [view, setView] = useState<'balances' | 'claim'>('balances');
  const [asset, setAsset] = useState<string | null>(null);
  const refreshRef = useRef<() => void>(() => {});
  const claim = useClaimAttempt(props.token, () => {
    // Claim state changed: re-read server balances now and again after the next 15 s snapshot.
    refreshRef.current();
    setTimeout(() => refreshRef.current(), 16000);
  });
  // Sync gate: after a claim settles, balances count as "syncing" until a successful fetch returns a snapshot
  // newer than the settlement. Only drives messaging and pauses NEW claims; no amount is ever altered.
  // Persisted (timestamps only, tagged with the token) so a reload cannot bypass it; Main is keyed by token,
  // so a token change starts from a clean slate and never inherits another account's gate.
  const tag = tokenTag(props.token);
  const [gate, setGate] = useState<StoredGate | null>(() => restoreGate(loadGate<StoredGate>(), tag));
  // Poll balances while a claim is unresolved or syncing so the snapshot that reflects it shows up
  // (also retries automatically if a refresh fails, e.g. 503).
  const balances = useBalances(props.token, claim.locked || gate ? 5000 : null);
  refreshRef.current = balances.refresh;

  const settledId = claim.attempt?.phase === 'done' ? claim.attempt.claim?.id ?? null : null;
  const latest = useRef({ attempt: claim.attempt, asOf: balances.data?.asOf ?? null });
  latest.current = { attempt: claim.attempt, asOf: balances.data?.asOf ?? null };
  useEffect(() => {
    if (!settledId || !latest.current.attempt?.claim) return;
    const c = latest.current.attempt.claim;
    const stored = loadGate<StoredGate>();
    const g = ensureGate(stored, tag, c, latest.current.asOf, Date.now());
    if (g !== stored) saveGate(g);
    setGate(g.closed ? null : g);
  }, [settledId, tag]);
  useEffect(() => {
    if (!gate) return;
    const snap = { okStartedAt: balances.okStartedAt, asOf: balances.data?.asOf ?? null };
    if (isReconciled(gate, snap) || isExpired(gate, Date.now())) {
      saveGate({ ...gate, closed: true }); // remember it was reconciled so a reload does not re-open it
      setGate(null);
    }
  }, [gate, balances.okStartedAt, balances.data, balances.refreshing]);
  const syncing = !!gate;

  return (
    <View>
      <View style={styles.header}>
        <Text style={text.h1}>CashMine Payback</Text>
        <Button label="Token" kind="secondary" size="sm" onPress={props.onChangeToken} />
      </View>
      {claim.attempt && (
        <ClaimStatus
          attempt={claim.attempt}
          busy={claim.busy}
          pollError={claim.pollError}
          syncing={syncing}
          balanceError={balances.error}
          onRecheck={claim.recheck}
          onDismiss={claim.dismiss}
        />
      )}
      {view === 'balances' || !balances.data ? (
        <BalancesScreen
          data={balances.data}
          error={balances.error}
          loading={balances.loading}
          refreshing={balances.refreshing}
          onRefresh={balances.refresh}
          onClaim={(a) => {
            setAsset(a);
            setView('claim');
          }}
          onChangeToken={props.onChangeToken}
          claimInProgress={claim.locked}
          syncing={syncing}
        />
      ) : (
        <ClaimScreen
          token={props.token}
          items={balances.data.items}
          initialAsset={asset}
          locked={claim.locked}
          syncing={syncing}
          rejection={claim.rejection}
          onSubmit={claim.start}
          onRefreshBalances={balances.refresh}
          onBack={() => setView('balances')}
          onChangeToken={props.onChangeToken}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { alignItems: 'center', padding: 12, paddingBottom: 32 },
  column: { width: '100%', maxWidth: 480 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
});

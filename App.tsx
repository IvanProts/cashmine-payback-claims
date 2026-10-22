import React, { useRef, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { clearToken, loadToken, saveToken } from './src/lib/storage';
import { BalancesScreen } from './src/screens/BalancesScreen';
import { ClaimScreen } from './src/screens/ClaimScreen';
import { ClaimStatus } from './src/screens/ClaimStatus';
import { TokenScreen } from './src/screens/TokenScreen';
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
            <Main token={token} onChangeToken={() => setEditingToken(true)} />
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
  // Poll balances while a claim is unresolved so the snapshot that reflects it shows up.
  const balances = useBalances(props.token, claim.locked ? 5000 : null);
  refreshRef.current = balances.refresh;

  return (
    <View>
      <View style={styles.header}>
        <Text style={text.h1}>CashMine Payback</Text>
        <Button label="Token" kind="secondary" onPress={props.onChangeToken} style={{ minHeight: 36 }} />
      </View>
      {claim.attempt && (
        <ClaimStatus
          attempt={claim.attempt}
          busy={claim.busy}
          pollError={claim.pollError}
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
        />
      ) : (
        <ClaimScreen
          token={props.token}
          items={balances.data.items}
          initialAsset={asset}
          locked={claim.locked}
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
  scroll: { alignItems: 'center', padding: 16, paddingBottom: 48 },
  column: { width: '100%', maxWidth: 480 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
});

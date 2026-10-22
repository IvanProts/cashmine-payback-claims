import React, { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { clearToken, loadToken, saveToken } from './src/lib/storage';
import { BalancesScreen } from './src/screens/BalancesScreen';
import { TokenScreen } from './src/screens/TokenScreen';
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
  const balances = useBalances(props.token, null);
  return (
    <View>
      <View style={styles.header}>
        <Text style={text.h1}>CashMine Payback</Text>
        <Button label="Token" kind="secondary" onPress={props.onChangeToken} style={{ minHeight: 36 }} />
      </View>
      <BalancesScreen
        data={balances.data}
        error={balances.error}
        loading={balances.loading}
        refreshing={balances.refreshing}
        onRefresh={balances.refresh}
        onClaim={() => {}}
        onChangeToken={props.onChangeToken}
        claimInProgress={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { alignItems: 'center', padding: 16, paddingBottom: 48 },
  column: { width: '100%', maxWidth: 480 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
});

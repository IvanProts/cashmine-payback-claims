import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Banner, Button, Card, colors, text } from '../ui';

export function TokenScreen(props: {
  hasToken: boolean;
  onSave: (token: string) => void;
  onCancel: () => void;
  onForget: () => void;
}) {
  const [value, setValue] = useState('');
  const submit = () => {
    const t = value.trim();
    if (t) props.onSave(t);
  };
  return (
    <View>
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.muted, letterSpacing: 0.6, marginTop: 24 }}>CASHMINE</Text>
      <Text style={text.h1}>{props.hasToken ? 'Change API token' : 'Enter your API token'}</Text>
      <Text style={[text.muted, { marginTop: 6, marginBottom: 16, lineHeight: 19 }]}>
        The token from your task email. It is stored only in this browser (localStorage) and sent only to the CashMine
        API.
      </Text>
      <Card>
        <Text style={text.muted}>Bearer token</Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          onSubmitEditing={submit}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          placeholder="Paste token"
          style={styles.input}
        />
        <Button label="Save token" onPress={submit} disabled={!value.trim()} />
      </Card>
      {props.hasToken && (
        <>
          <Banner tone="warn">A token is currently saved. Saving a new one replaces it.</Banner>
          <Button label="Cancel" kind="secondary" onPress={props.onCancel} style={{ marginBottom: 8 }} />
          <Button label="Forget saved token" kind="danger" onPress={props.onForget} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
    fontSize: 16,
    marginVertical: 10,
    color: colors.text,
  },
});

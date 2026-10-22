import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError, BalanceItem, ClaimBody, ClaimOptions, getClaimOptions } from '../lib/api';
import { claimPreview, plain, validateAmount } from '../lib/money';
import { Banner, Button, Card, colors, text } from '../ui';

function Chip(props: { label: string; active: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={[styles.chip, props.active && styles.chipActive, props.disabled && { opacity: 0.5 }]}
    >
      <Text style={{ color: props.active ? '#fff' : colors.text, fontWeight: '600' }}>{props.label}</Text>
    </Pressable>
  );
}

export function ClaimScreen(props: {
  token: string;
  items: BalanceItem[];
  initialAsset: string | null;
  locked: boolean; // a claim attempt is unresolved: form disabled
  rejection: ApiError | null;
  onSubmit: (body: ClaimBody) => void;
  onRefreshBalances: () => void;
  onBack: () => void;
  onChangeToken: () => void;
}) {
  const [asset, setAsset] = useState<string | null>(props.initialAsset ?? props.items[0]?.asset ?? null);
  const [options, setOptions] = useState<ClaimOptions | null>(null);
  const [optError, setOptError] = useState<Error | null>(null);
  const [optLoading, setOptLoading] = useState(false);
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [confirming, setConfirming] = useState(false);

  const item = props.items.find((i) => i.asset === asset) ?? null;

  const loadOptions = useCallback(async () => {
    if (!asset) return;
    setOptLoading(true);
    setOptError(null);
    setOptions(null);
    try {
      const o = await getClaimOptions(props.token, asset);
      setOptions(o);
      setDestinationId(o.destinations[0]?.id ?? null);
    } catch (e) {
      setOptError(e as Error);
    } finally {
      setOptLoading(false);
    }
  }, [asset, props.token]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  // A submitted claim moves the form to the status view; leave the confirm step behind.
  useEffect(() => {
    if (props.locked || props.rejection) setConfirming(false);
  }, [props.locked, props.rejection]);

  if (!item) return <Text style={text.muted}>No asset available to claim.</Text>;

  const check =
    options && amountText !== ''
      ? validateAmount(amountText, { decimals: item.decimals, minAmount: options.minAmount, available: item.available })
      : null;
  const valid = check?.ok ? check : null;
  const preview = valid && options ? claimPreview(valid.amount, options.fee) : null;
  const destination = options?.destinations.find((d) => d.id === destinationId) ?? null;
  const canSubmit = !!valid && !!options && !!destination && !props.locked;

  const submit = () => {
    if (!canSubmit || !valid || !destination) return;
    props.onSubmit({ asset: item.asset, amount: valid.text, destinationId: destination.id });
  };

  const serverMsg =
    props.rejection &&
    `${props.rejection.message}${props.rejection.field ? ` (field: ${props.rejection.field})` : ''}`;

  return (
    <View>
      <Button label="← Back to balances" kind="secondary" onPress={props.onBack} style={{ marginBottom: 12 }} />
      <Text style={[text.h1, { marginBottom: 8 }]}>Claim</Text>

      {props.rejection && (
        <Banner tone="error">
          {props.rejection.status === 401
            ? 'Your token is invalid or expired.'
            : `The server rejected the claim — nothing was submitted. ${serverMsg}`}
        </Banner>
      )}
      {props.rejection?.status === 401 && (
        <Button label="Change token" onPress={props.onChangeToken} style={{ marginBottom: 12 }} />
      )}
      {props.locked && <Banner tone="warn">A claim is in progress. You can submit another once it finishes.</Banner>}

      <Card>
        <Text style={text.muted}>Asset</Text>
        <View style={styles.row}>
          {props.items.map((i) => (
            <Chip
              key={i.asset}
              label={i.asset}
              active={i.asset === asset}
              disabled={confirming || props.locked}
              onPress={() => {
                setAsset(i.asset);
                setAmountText('');
              }}
            />
          ))}
        </View>

        {optLoading && <ActivityIndicator style={{ marginVertical: 12 }} />}
        {optError && (
          <>
            <Banner tone="error">Could not load claim options: {optError.message}</Banner>
            <Button label="Retry" kind="secondary" onPress={loadOptions} />
          </>
        )}

        {options && (
          <>
            <Text style={[text.muted, { marginTop: 8 }]}>Destination</Text>
            <View style={styles.row}>
              {options.destinations.map((d) => (
                <Chip
                  key={d.id}
                  label={d.label}
                  active={d.id === destinationId}
                  disabled={confirming || props.locked}
                  onPress={() => setDestinationId(d.id)}
                />
              ))}
            </View>

            <Text style={[text.muted, { marginTop: 8 }]}>
              Available {plain(item.available)} · Min {plain(options.minAmount)} · Fee {plain(options.fee)} {item.asset}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TextInput
                value={amountText}
                onChangeText={setAmountText}
                editable={!confirming && !props.locked}
                keyboardType="decimal-pad"
                inputMode="decimal"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={`Amount in ${item.asset}`}
                style={styles.input}
              />
              <Button
                label="Max"
                kind="secondary"
                disabled={confirming || props.locked}
                onPress={() => setAmountText(plain(item.available))}
              />
            </View>
            {check && !check.ok && <Text style={styles.err}>{check.message}</Text>}

            {preview && valid && (
              <View style={{ marginTop: 10 }}>
                <Text style={text.body}>Fee: {plain(preview.fee)} {item.asset}</Text>
                <Text style={[text.body, { fontWeight: '700' }]}>
                  You receive: {plain(preview.receive)} {item.asset}
                </Text>
                {!preview.receive.gt(0) && (
                  <Text style={styles.err}>
                    Warning: the fee is not smaller than the amount, so you would receive nothing.
                  </Text>
                )}
              </View>
            )}

            {!confirming && (
              <Button
                label="Review claim"
                onPress={() => {
                  props.onRefreshBalances(); // re-validate against the freshest snapshot
                  setConfirming(true);
                }}
                disabled={!canSubmit}
                style={{ marginTop: 12 }}
              />
            )}
          </>
        )}
      </Card>

      {confirming && valid && preview && destination && (
        <Card>
          <Text style={text.h2}>Confirm claim</Text>
          <Text style={[text.body, { marginTop: 6 }]}>Claim: {valid.text} {item.asset}</Text>
          <Text style={text.body}>Fee: {plain(preview.fee)} {item.asset}</Text>
          <Text style={[text.body, { fontWeight: '700' }]}>
            You receive: {plain(preview.receive)} {item.asset}
          </Text>
          <Text style={text.body}>To: {destination.label}</Text>
          <Text style={[text.muted, { marginVertical: 8 }]}>
            This is a financial operation and cannot be cancelled once submitted.
          </Text>
          <Button label="Confirm and submit" onPress={submit} disabled={!canSubmit} style={{ marginBottom: 8 }} />
          <Button label="Edit" kind="secondary" onPress={() => setConfirming(false)} />
        </Card>
      )}
      {confirming && !valid && (
        <Banner tone="warn">Balances changed and this claim is no longer valid. Go back and edit the amount.</Banner>
      )}
      {confirming && !valid && <Button label="Edit" kind="secondary" onPress={() => setConfirming(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  chip: {
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 16,
    color: colors.text,
  },
  err: { color: colors.danger, fontSize: 13, marginTop: 6 },
});

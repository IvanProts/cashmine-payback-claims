import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError, BalanceItem, ClaimBody, ClaimOptions, getClaimOptions } from '../lib/api';
import { claimPreview, plain, validateAmount } from '../lib/money';
import { Avatar, Banner, Button, Card, colors, num, text } from '../ui';

function Pill(props: { label: string; asset?: string; active: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={[styles.pill, props.active && styles.pillActive, props.disabled && !props.active && { opacity: 0.5 }]}
    >
      {props.asset && <Avatar asset={props.asset} size={22} />}
      <Text style={{ color: props.active ? '#fff' : colors.text, fontWeight: '700', fontSize: 14 }}>{props.label}</Text>
    </Pressable>
  );
}

function SummaryRow(props: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 5 }}>
      <Text style={props.strong ? text.h2 : text.muted}>{props.label}</Text>
      <Text
        style={[
          props.strong ? { fontSize: 22, fontWeight: '800', color: colors.text } : { fontSize: 15, fontWeight: '600', color: props.muted ? colors.muted : colors.text },
          num,
        ]}
      >
        {props.value}
      </Text>
    </View>
  );
}

export function ClaimScreen(props: {
  token: string;
  items: BalanceItem[];
  initialAsset: string | null;
  locked: boolean; // a claim attempt is unresolved: form disabled
  syncing: boolean; // settled claim not yet reconciled with a newer snapshot: new submissions paused
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

  const optSeq = useRef(0); // only the latest request may update state (asset switch / unmount)

  // getClaimOptions retries transient errors itself; an error here means retries were exhausted.
  const loadOptions = useCallback(async () => {
    if (!asset) return;
    const id = ++optSeq.current;
    setOptLoading(true);
    setOptError(null);
    setOptions(null);
    try {
      const o = await getClaimOptions(props.token, asset);
      if (id !== optSeq.current) return;
      setOptions(o);
      setDestinationId(o.destinations[0]?.id ?? null);
    } catch (e) {
      if (id === optSeq.current) setOptError(e as Error);
    } finally {
      if (id === optSeq.current) setOptLoading(false);
    }
  }, [asset, props.token]);

  useEffect(() => {
    loadOptions();
    return () => {
      optSeq.current++;
    };
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
  const canSubmit = !!valid && !!options && !!destination && !props.locked && !props.syncing;

  const submit = () => {
    if (!canSubmit || !valid || !destination) return;
    props.onSubmit({ asset: item.asset, amount: valid.text, destinationId: destination.id });
  };

  const serverMsg =
    props.rejection &&
    `${props.rejection.message}${props.rejection.field ? ` (field: ${props.rejection.field})` : ''}`;


  const locked = confirming || props.locked;
  const feeText = options ? `${plain(options.fee)} ${item.asset}` : '—';

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
        <Pressable onPress={props.onBack} accessibilityRole="button" accessibilityLabel="Back to balances" style={styles.back}>
          <Text style={{ fontSize: 22, color: colors.text, marginTop: -2 }}>‹</Text>
        </Pressable>
        <Text style={[text.h1, { marginLeft: 12 }]}>Claim</Text>
      </View>

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
      {props.locked && (
        <Text style={[text.muted, { marginBottom: 12, lineHeight: 19 }]}>
          A claim is in progress. You can submit another once it finishes.
        </Text>
      )}
      {!props.locked && props.syncing && (
        <Text style={[text.muted, { marginBottom: 12, lineHeight: 19 }]}>
          New claims are paused until balances catch up with your last claim (refreshes automatically, usually within ~15
          s). You can still edit the amount.
        </Text>
      )}

      <View style={styles.row}>
        {props.items.map((i) => (
          <Pill
            key={i.asset}
            label={i.asset}
            asset={i.asset}
            active={i.asset === asset}
            disabled={locked}
            onPress={() => {
              setAsset(i.asset);
              setAmountText('');
            }}
          />
        ))}
      </View>

      {optLoading && <ActivityIndicator style={{ marginVertical: 24 }} />}
      {optError && (
        <Card>
          <Text style={{ color: colors.danger, fontSize: 14, marginBottom: 10 }}>
            Could not load claim options: {optError.message}
          </Text>
          <Button label="Retry" kind="secondary" onPress={loadOptions} />
        </Card>
      )}

      {options && !confirming && !props.locked && (
        <>
          <Card style={{ alignItems: 'center', paddingVertical: 20 }}>
            <Text style={text.label}>YOU CLAIM</Text>
            <TextInput
              value={amountText}
              onChangeText={setAmountText}
              editable={!locked}
              keyboardType="decimal-pad"
              inputMode="decimal"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="0"
              placeholderTextColor={colors.faint}
              style={[styles.amountInput, num, { color: check && !check.ok ? colors.danger : colors.text }]}
            />
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.muted }}>{item.asset}</Text>
            {check && !check.ok && <Text style={[styles.err, { textAlign: 'center' }]}>{check.message}</Text>}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 10 }}>
              <Text style={[text.muted, num]}>
                Available {plain(item.available)} {item.asset} · Min {plain(options.minAmount)} {item.asset}
              </Text>
            </View>
            <Button
              label="Use max"
              kind="secondary"
              size="sm"
              disabled={locked}
              onPress={() => setAmountText(plain(item.available))}
              style={{ marginTop: 10 }}
            />
          </Card>

          <Card>
            <SummaryRow label="You claim" value={valid ? `${valid.text} ${item.asset}` : '—'} />
            <SummaryRow label="Fee" value={`− ${feeText}`} muted />
            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
            <SummaryRow label="You receive" value={preview ? `${plain(preview.receive)} ${item.asset}` : '—'} strong />
            {preview && !preview.receive.gt(0) && (
              <Text style={styles.err}>Warning: the fee is not smaller than the amount, so you would receive nothing.</Text>
            )}
            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
            <Text style={text.label}>TO</Text>
            <View style={[styles.row, { marginTop: 8 }]}>
              {options.destinations.map((d) => (
                <Pill key={d.id} label={d.label} active={d.id === destinationId} disabled={locked} onPress={() => setDestinationId(d.id)} />
              ))}
            </View>
          </Card>

          <Button
            label="Review claim"
            onPress={() => {
              props.onRefreshBalances(); // re-validate against the freshest snapshot
              setConfirming(true);
            }}
            disabled={!canSubmit}
          />
        </>
      )}

      {confirming && valid && preview && destination && (
        <Card style={{ borderWidth: 2, borderColor: colors.primary }}>
          <Text style={[text.h2, { marginBottom: 6 }]}>Confirm claim</Text>
          <SummaryRow label="You claim" value={`${valid.text} ${item.asset}`} />
          <SummaryRow label="Fee" value={`− ${plain(preview.fee)} ${item.asset}`} muted />
          <SummaryRow label="You receive" value={`${plain(preview.receive)} ${item.asset}`} strong />
          <SummaryRow label="To" value={destination.label} muted />
          <Text style={[text.muted, { marginVertical: 10 }]}>
            This is a financial operation and cannot be cancelled once submitted.
          </Text>
          <Button label="Confirm and submit" onPress={submit} disabled={!canSubmit} />
          <Button label="Edit amount" kind="link" onPress={() => setConfirming(false)} />
        </Card>
      )}
      {confirming && !valid && (
        <Banner tone="warn">Balances changed and this claim is no longer valid. Go back and edit the amount.</Banner>
      )}
      {confirming && !valid && <Button label="Edit amount" kind="link" onPress={() => setConfirming(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  amountInput: {
    width: '100%',
    textAlign: 'center',
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -1,
    paddingVertical: 6,
    ...({ outlineStyle: 'none' } as object),
  },
  err: { color: colors.danger, fontSize: 13, marginTop: 6 },
});

import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { ClaimAttempt } from '../lib/claimFlow';
import { plain } from '../lib/money';
import { Banner, Button, Card, text } from '../ui';

/** Pending/finished claim state, shown next to (never merged into) the server-authoritative balances. */
export function ClaimStatus(props: {
  attempt: ClaimAttempt;
  busy: boolean;
  pollError: Error | null;
  onRecheck: () => void;
  onDismiss: () => void;
}) {
  const { attempt, busy } = props;
  const claim = attempt.claim;
  const amount = `${plain(attempt.body.amount)} ${attempt.body.asset}`;

  if (attempt.phase === 'sending') {
    return (
      <Banner tone="info">
        Submitting claim of {amount}… Please keep this page open. The request carries a unique key, so it cannot be
        applied twice.
      </Banner>
    );
  }
  if (attempt.phase === 'unknown') {
    return (
      <Card>
        <Banner tone="warn">
          We could not confirm whether your claim of {amount} was received. Nothing is assumed: balances stay as the
          server reports them. Checking again re-sends the identical request with the same key, so it can never create a
          duplicate. New claims are blocked until this is resolved.
        </Banner>
        <Button label={busy ? 'Checking…' : 'Check again'} onPress={props.onRecheck} disabled={busy} />
        <Text style={[text.muted, { marginTop: 6 }]}>Request key: {attempt.key.slice(0, 8)}…</Text>
      </Card>
    );
  }
  if (!claim) return null;

  const terminal = attempt.phase === 'done';
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={text.h2}>Claim {claim.status}</Text>
        {!terminal && <ActivityIndicator />}
      </View>
      <Text style={text.body}>
        {plain(claim.amount)} {claim.asset} · fee {plain(claim.fee)} · you receive {plain(claim.receiveAmount)}
      </Text>
      <Text style={text.muted}>ID {claim.id}</Text>
      {claim.status === 'pending' && (
        <Text style={[text.muted, { marginTop: 6 }]}>
          Settles within about 20 s. The amount appears under “Claiming” once the next balance snapshot is taken.
          {props.pollError ? ' Status check failed, retrying…' : ''}
        </Text>
      )}
      {claim.status === 'completed' && (
        <Banner tone="ok">Completed. Balances refresh from the server with the next snapshot.</Banner>
      )}
      {claim.status === 'failed' && (
        <Banner tone="error">
          Failed{claim.failureReason ? `: ${claim.failureReason}` : ''}. The amount returns to available (visible after
          the next balance snapshot).
        </Banner>
      )}
      {terminal && <Button label="Dismiss" kind="secondary" onPress={props.onDismiss} style={{ marginTop: 8 }} />}
    </Card>
  );
}

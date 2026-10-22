import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { ClaimAttempt } from '../lib/claimFlow';
import { plain } from '../lib/money';
import { Banner, Button, Card, colors, text } from '../ui';

/**
 * Claim state, kept apart from the balance snapshot: the claim line is confirmed by GET /claims/{id};
 * the "Balances" line says whether the snapshot below has caught up yet.
 */
export function ClaimStatus(props: {
  attempt: ClaimAttempt;
  busy: boolean;
  pollError: Error | null;
  syncing: boolean;
  balanceError: Error | null;
  onRecheck: () => void;
  onDismiss: () => void;
}) {
  const { attempt, busy } = props;
  const claim = attempt.claim;
  const amount = `${plain(attempt.body.amount)} ${attempt.body.asset}`;

  if (attempt.phase === 'sending') {
    return (
      <Banner tone="info">
        Submitting claim of {amount}… Keep this page open. The request carries a unique key, so it cannot be applied
        twice.
      </Banner>
    );
  }
  if (attempt.phase === 'unknown') {
    return (
      <Card>
        <Text style={text.h2}>Claim outcome unknown</Text>
        <Text style={[text.muted, { marginVertical: 6 }]}>
          We could not confirm whether your claim of {amount} was received. Checking again re-sends the identical
          request with the same key, so it can never create a duplicate. New claims are blocked until this is resolved.
        </Text>
        <Button label={busy ? 'Checking…' : 'Check again'} onPress={props.onRecheck} disabled={busy} />
        <Text style={[text.muted, { marginTop: 4 }]}>Request key: {attempt.key.slice(0, 8)}…</Text>
      </Card>
    );
  }
  if (!claim) return null;

  const terminal = attempt.phase === 'done';
  const unit = claim.asset;
  const tone = claim.status === 'completed' ? colors.ok : claim.status === 'failed' ? colors.danger : colors.info;

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[text.h2, { color: tone }]}>
          Claim {claim.status}
          <Text style={text.muted}>{terminal ? ' · confirmed' : ''}</Text>
        </Text>
        {!terminal ? (
          <ActivityIndicator />
        ) : (
          <Button label="Dismiss" kind="link" size="sm" onPress={props.onDismiss} />
        )}
      </View>
      <Text style={text.body}>
        {plain(claim.amount)} {unit} · fee {plain(claim.fee)} {unit} · you receive {plain(claim.receiveAmount)} {unit}
      </Text>
      <Text style={text.muted}>ID {claim.id}</Text>

      {claim.status === 'pending' && (
        <Text style={[text.muted, { marginTop: 4 }]}>
          Settles within about 20 s.{props.pollError ? ' Status check failed, retrying…' : ''}
        </Text>
      )}
      {claim.status === 'failed' && (
        <Text style={{ color: colors.danger, fontSize: 13, marginTop: 4 }}>
          Failed{claim.failureReason ? `: ${claim.failureReason}` : ''}. The amount returns to available.
        </Text>
      )}
      {terminal && (
        <Text style={{ color: props.syncing ? colors.info : colors.ok, fontSize: 13, marginTop: 4 }}>
          {props.syncing
            ? `Balances: syncing — the snapshot below may still show this claim under “Claiming” or an outdated available amount.${
                props.balanceError ? ' Last refresh failed; retrying…' : ''
              }`
            : 'Balances: updated from the server.'}
        </Text>
      )}
    </Card>
  );
}

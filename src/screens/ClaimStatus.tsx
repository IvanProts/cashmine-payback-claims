import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ClaimAttempt } from '../lib/claimFlow';
import { describeFailure } from '../lib/claimForm';
import { plain } from '../lib/money';
import { Button, Card, colors, num, text } from '../ui';

function Badge(props: { kind: 'spin' | 'ok' | 'fail' | 'warn' }) {
  const map = {
    spin: { bg: colors.soft, fg: colors.muted, glyph: '' },
    ok: { bg: colors.okBg, fg: colors.ok, glyph: '✓' },
    fail: { bg: colors.dangerBg, fg: colors.danger, glyph: '!' },
    warn: { bg: colors.warnBg, fg: colors.warn, glyph: '?' },
  }[props.kind];
  return (
    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: map.bg, alignItems: 'center', justifyContent: 'center' }}>
      {props.kind === 'spin' ? <ActivityIndicator size="small" /> : <Text style={{ color: map.fg, fontWeight: '800', fontSize: 16 }}>{map.glyph}</Text>}
    </View>
  );
}

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
      <Card style={{ padding: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Badge kind="spin" />
          <View style={{ flex: 1 }}>
            <Text style={[text.h2, num]}>Submitting {amount}…</Text>
            <Text style={text.muted}>Keep this page open. The request is protected against duplicates.</Text>
          </View>
        </View>
      </Card>
    );
  }
  if (attempt.phase === 'unknown') {
    return (
      <Card style={{ padding: 14, backgroundColor: colors.warnBg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Badge kind="warn" />
          <View style={{ flex: 1 }}>
            <Text style={[text.h2, { color: colors.warn }]}>Claim status unknown</Text>
            <Text style={{ color: colors.warn, fontSize: 13, lineHeight: 18 }}>
              We couldn’t confirm whether your {amount} claim was received. Checking again re-sends the same request with
              the same key, so it can’t be applied twice. New claims are paused until this is resolved.
            </Text>
          </View>
        </View>
        <Button label={busy ? 'Checking…' : 'Check again'} onPress={props.onRecheck} disabled={busy} size="sm" style={{ marginTop: 10, alignSelf: 'flex-start' }} />
      </Card>
    );
  }
  if (!claim) return null;

  const terminal = attempt.phase === 'done';
  const unit = claim.asset;
  const kind = claim.status === 'completed' ? 'ok' : claim.status === 'failed' ? 'fail' : 'spin';
  const label = { pending: 'Pending', completed: 'Completed', failed: 'Failed' }[claim.status];
  const tone = claim.status === 'completed' ? colors.ok : claim.status === 'failed' ? colors.danger : colors.muted;

  return (
    <Card style={{ padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Badge kind={kind} />
        <View style={{ flex: 1 }}>
          <Text style={[text.h2, num]}>
            Claim of {plain(claim.amount)} {unit}
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: tone }}>
            {label}
            <Text style={{ fontWeight: '400', color: colors.muted }}>
              {claim.status === 'pending'
                ? ` · settles in about 20 s${props.pollError ? ' · status check failed, retrying…' : ''}`
                : terminal
                  ? ' · confirmed by server'
                  : ''}
            </Text>
          </Text>
        </View>
        {terminal && (
          <Pressable onPress={props.onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10}>
            <Text style={{ color: colors.faint, fontSize: 22, paddingHorizontal: 4 }}>×</Text>
          </Pressable>
        )}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
        <Text style={[text.muted, num]}>
          Fee {plain(claim.fee)} {unit}
        </Text>
        <Text style={[{ fontSize: 13, fontWeight: '700', color: colors.text }, num]}>
          You receive {plain(claim.receiveAmount)} {unit}
        </Text>
      </View>

      {claim.status === 'failed' && (
        <Text style={{ color: colors.danger, fontSize: 13, marginTop: 6 }}>
          {describeFailure(claim.failureReason)}
        </Text>
      )}
      {terminal && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, marginRight: 7, backgroundColor: props.syncing ? '#F5B83D' : colors.accent }} />
          <Text style={{ color: colors.muted, fontSize: 12, flex: 1, lineHeight: 16 }}>
            {props.syncing
              ? `Balances syncing — the figures below may still show this claim under “Claiming” or an outdated available amount.${
                  props.balanceError ? ' Last refresh failed; retrying…' : ''
                }`
              : 'Balances updated from the server.'}
          </Text>
        </View>
      )}
      <Text style={[text.muted, { fontSize: 11, color: colors.faint, marginTop: 6 }]}>ID {claim.id}</Text>
    </Card>
  );
}

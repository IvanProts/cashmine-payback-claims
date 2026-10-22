import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { ActivityItem, formatSignedAmount } from '../lib/activity';
import { ApiError } from '../lib/api';
import { useActivity } from '../useActivity';
import { Banner, Button, Card, colors, num, text } from '../ui';

const TYPES: Record<string, { label: string; glyph: string; bg: string; fg: string }> = {
  accrual: { label: 'Payback', glyph: '↓', bg: colors.okBg, fg: colors.ok },
  reversal: { label: 'Reversal', glyph: '↩', bg: colors.warnBg, fg: colors.warn },
  claim: { label: 'Claim', glyph: '↑', bg: colors.soft, fg: colors.text },
};

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  pending: { bg: colors.warnBg, fg: colors.warn },
  confirmed: { bg: colors.okBg, fg: colors.ok },
  completed: { bg: colors.okBg, fg: colors.ok },
  failed: { bg: colors.dangerBg, fg: colors.danger },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function ActivityRow(props: { item: ActivityItem; first: boolean }) {
  const { item } = props;
  const meta = TYPES[item.type] ?? { label: item.type, glyph: '•', bg: colors.soft, fg: colors.muted };
  const amount = formatSignedAmount(item.amount);
  const tone = STATUS_TONE[item.status] ?? { bg: colors.soft, fg: colors.muted };
  const subtitle = [item.exchange, formatDate(item.createdAt)].filter(Boolean).join(' · ');
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderTopWidth: props.first ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: meta.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: meta.fg, fontSize: 18, fontWeight: '800' }}>{meta.glyph}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
        <Text style={text.h2}>{meta.label}</Text>
        <Text style={text.muted} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text
          style={[
            { fontSize: 16, fontWeight: '700', color: amount.sign === 'positive' ? colors.ok : colors.text },
            num,
          ]}
        >
          {amount.text} {item.asset}
        </Text>
        <View style={{ backgroundColor: tone.bg, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 2, marginTop: 3 }}>
          <Text style={{ color: tone.fg, fontSize: 11, fontWeight: '700' }}>{item.status}</Text>
        </View>
      </View>
    </View>
  );
}

export function ActivityScreen(props: { token: string; onChangeToken: () => void }) {
  const a = useActivity(props.token);
  const unauthorized = a.error instanceof ApiError && a.error.status === 401;

  if (a.loading) {
    return (
      <View style={{ padding: 40, alignItems: 'center' }}>
        <ActivityIndicator />
        <Text style={[text.muted, { marginTop: 8 }]}>Loading activity…</Text>
      </View>
    );
  }

  if (a.error) {
    return (
      <View>
        <Banner tone="error">
          {unauthorized ? 'Your token is missing, invalid or expired.' : `Could not load activity: ${a.error.message}`}
        </Banner>
        {unauthorized ? (
          <Button label="Change token" onPress={props.onChangeToken} />
        ) : (
          <Button label="Retry" onPress={a.reload} />
        )}
      </View>
    );
  }

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, marginHorizontal: 4 }}>
        <Text style={text.label}>HISTORY · NEWEST FIRST</Text>
        <Button label="↻ Refresh" kind="secondary" size="sm" onPress={a.reload} />
      </View>

      {a.items.length === 0 ? (
        <Card style={{ alignItems: 'center', paddingVertical: 32 }}>
          <Text style={text.h2}>No activity yet</Text>
          <Text style={[text.muted, { textAlign: 'center', marginTop: 6 }]}>
            Payback accruals, reversals and claims will appear here.
          </Text>
        </Card>
      ) : (
        <Card style={{ paddingVertical: 4, paddingHorizontal: 16 }}>
          {a.items.map((item, idx) => (
            <ActivityRow key={item.id} item={item} first={idx === 0} />
          ))}
        </Card>
      )}

      {a.moreError && (
        <Text style={{ color: colors.danger, fontSize: 13, marginBottom: 8, textAlign: 'center' }}>
          Could not load more: {a.moreError.message}
        </Text>
      )}
      {a.hasMore ? (
        <Button
          label={a.loadingMore ? 'Loading…' : a.moreError ? 'Retry' : 'Load more'}
          kind="secondary"
          onPress={a.loadMore}
          disabled={a.loadingMore}
        />
      ) : (
        a.items.length > 0 && <Text style={[text.muted, { textAlign: 'center', marginTop: 4 }]}>You’re all caught up</Text>
      )}
    </View>
  );
}

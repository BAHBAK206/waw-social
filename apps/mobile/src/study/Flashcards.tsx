import type { FlashcardDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ReadAloud } from '@/components/ReadAloud';
import { Badge, Sheet, SwitchRow } from '@/components/kit';
import { Button, Card, Chip, Empty, Input, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { confirm, toast, toastError } from '@/lib/ui';

type Rating = 'again' | 'unsure' | 'know' | 'easy';

/** One review session over the due cards (optionally one deck); "again" sends the card to the back of the queue. */
function Reviewer({ deck, onDone }: { deck?: string; onDone: () => void }) {
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const due = useQuery({ queryKey: ['flashcards', 'due', deck ?? ''], queryFn: () => api.flashcards.list({ due: true, deck }), staleTime: Infinity });
  const [queue, setQueue] = useState<FlashcardDto[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [busy, setBusy] = useState(false);
  const cards = queue ?? due.data?.items ?? [];
  if (due.isPending) return <Loading />;
  if (!cards.length)
    return (
      <View style={{ gap: 12, alignItems: 'center' }}>
        <Text weight="black" size={20} style={{ textAlign: 'center' }}>
          {reviewed ? tr.t('academic.cards.sessionDone', { count: reviewed }) : tr.t('academic.cards.noneDue')}
        </Text>
        <Button title={tr.t('common.done')} onPress={onDone} />
      </View>
    );
  const card = cards[0]!;
  const rate = async (rating: Rating) => {
    setBusy(true);
    try {
      const res = await api.flashcards.review(card.id, rating);
      void Haptics.selectionAsync();
      const rest = cards.slice(1);
      setQueue(rating === 'again' ? [...rest, res.card] : rest);
      setReviewed((n) => n + 1);
      setFlipped(false);
      if (!rest.length && rating !== 'again') void qc.invalidateQueries({ queryKey: ['flashcards'] });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const ratings: { r: Rating; label: string; variant: 'danger' | 'outline' | 'soft' | 'primary' }[] = [
    { r: 'again', label: tr.t('academic.cards.again'), variant: 'danger' },
    { r: 'unsure', label: tr.t('academic.cards.unsure'), variant: 'outline' },
    { r: 'know', label: tr.t('academic.cards.know'), variant: 'soft' },
    { r: 'easy', label: tr.t('academic.cards.easy'), variant: 'primary' },
  ];
  return (
    <View style={{ gap: 12 }}>
      <Text muted size={12}>
        {tr.t('academic.cards.due', { count: cards.length })} · {card.deck}
      </Text>
      <Pressable
        onPress={() => setFlipped((f) => !f)}
        accessibilityRole="button"
        accessibilityLabel={flipped ? card.back : `${card.front} — ${tr.t('academic.cards.showAnswer')}`}
        style={{
          minHeight: 220,
          borderRadius: 18,
          padding: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: flipped ? t.primarySoft : t.bg2,
          borderWidth: 1,
          borderColor: t.border,
        }}
      >
        <Text weight="black" size={22} style={{ textAlign: 'center' }}>
          {flipped ? card.back : card.front}
        </Text>
        {!flipped && (
          <Text muted size={12} style={{ marginTop: 12 }}>
            {tr.t('academic.cards.showAnswer')}
          </Text>
        )}
      </Pressable>
      <View style={{ alignItems: 'center' }}>
        <ReadAloud text={flipped ? card.back : card.front} size={26} />
      </View>
      {flipped ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ratings.map((x) => (
            <View key={x.r} style={{ flexGrow: 1, flexBasis: '45%' }}>
              <Button title={x.label} variant={x.variant} disabled={busy} onPress={() => void rate(x.r)} />
            </View>
          ))}
        </View>
      ) : (
        <Button title={tr.t('academic.cards.showAnswer')} onPress={() => setFlipped(true)} />
      )}
    </View>
  );
}

export function FlashcardsTab() {
  const tr = useT();
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['flashcards', 'all'], queryFn: () => api.flashcards.list() });
  const [deck, setDeck] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [deckName, setDeckName] = useState('');
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['flashcards'] });
  if (q.isPending) return <Loading />;
  const decks = q.data?.decks ?? [];
  const shown = (q.data?.items ?? []).filter((c) => !deck || c.deck === deck);
  const dueInDeck = shown.filter((c) => c.dueAt <= Date.now()).length;

  const save = async () => {
    const dn = deckName.trim() || deck || 'General';
    const cards = bulk
      ? bulkText
          .split('\n')
          .map((l) => l.split('|'))
          .filter((p) => p.length >= 2 && p[0]!.trim() && p[1]!.trim())
          .map((p) => ({ front: p[0]!.trim(), back: p.slice(1).join('|').trim(), deck: dn }))
      : [{ front: front.trim(), back: back.trim(), deck: dn }];
    if (!cards.length || (!bulk && (!front.trim() || !back.trim()))) return;
    try {
      const res = await api.flashcards.create(cards);
      toast(tr.t('ai.savedCards', { count: res.items.length }));
      setFront('');
      setBack('');
      setBulkText('');
      setAdding(false);
      await refresh();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button
            icon="play"
            title={`${tr.t('academic.cards.review')}${dueInDeck ? ` (${tr.t('academic.cards.due', { count: dueInDeck })})` : ''}`}
            disabled={!dueInDeck}
            onPress={() => setReviewing(true)}
          />
        </View>
        <Button icon="add" variant="outline" title={tr.t('academic.cards.add')} onPress={() => setAdding(true)} />
      </View>
      {decks.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label={tr.t('common.all')} active={!deck} onPress={() => setDeck('')} />
          {decks.map((d) => (
            <Chip key={d.name} label={`${d.name} (${d.count})`} active={deck === d.name} onPress={() => setDeck(d.name)} />
          ))}
        </View>
      )}
      {!shown.length ? (
        <Empty icon="layers-outline" title={tr.t('academic.cards.noneDue')} />
      ) : (
        shown.map((c) => (
          <Card key={c.id} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Badge label={c.deck} />
              <View style={{ flex: 1 }} />
              <Text muted size={12}>
                {c.dueAt <= Date.now() ? tr.t('common.today') : tr.t('home.inDays', { count: Math.max(1, Math.ceil((c.dueAt - Date.now()) / 86400_000)) })}
              </Text>
              <Pressable
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={tr.t('common.delete')}
                onPress={async () => {
                  if (!(await confirm(tr.t('common.confirmDelete'), { danger: true }))) return;
                  try {
                    await api.flashcards.remove(c.id);
                    await refresh();
                  } catch (e) {
                    toastError(e);
                  }
                }}
              >
                <Text color={t.err} weight="bold" size={12}>
                  {tr.t('common.delete')}
                </Text>
              </Pressable>
            </View>
            <Text weight="bold">{c.front}</Text>
            <Text muted size={13} numberOfLines={2}>
              {c.back}
            </Text>
          </Card>
        ))
      )}
      <Sheet open={reviewing} onClose={() => setReviewing(false)} title={tr.t('academic.cards.title')}>
        {reviewing && (
          <Reviewer
            deck={deck || undefined}
            onDone={() => {
              setReviewing(false);
              void refresh();
            }}
          />
        )}
      </Sheet>
      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title={tr.t('academic.cards.add')}
        footer={<Button title={tr.t('common.save')} onPress={() => void save()} />}
      >
        <Input label={tr.t('academic.cards.deck')} value={deckName} placeholder={deck || 'General'} onChangeText={setDeckName} />
        <SwitchRow label={tr.t('academic.cards.bulk')} value={bulk} onChange={setBulk} />
        {bulk ? (
          <Input value={bulkText} onChangeText={setBulkText} multiline placeholder="front | back" style={{ minHeight: 140, textAlignVertical: 'top' }} />
        ) : (
          <>
            <Input label={tr.t('academic.cards.front')} value={front} onChangeText={setFront} multiline />
            <Input label={tr.t('academic.cards.back')} value={back} onChangeText={setBack} multiline />
          </>
        )}
      </Sheet>
    </View>
  );
}

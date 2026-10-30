import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { ReportButton } from '@/components/Report';
import { Screen } from '@/components/Screen';
import { FeatureGate } from '@/components/kit';
import { Avatar, Button, Card, ErrorView, Loading, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDay } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { confirm, toastError } from '@/lib/ui';

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['event', id], queryFn: () => api.events.get(id!) });
  const attendees = useQuery({ queryKey: ['event', id, 'attendees'], queryFn: () => api.events.attendees(id!) });
  if (q.isPending) return <Loading />;
  if (q.error || !q.data) return <ErrorView onRetry={() => void q.refetch()} />;
  const e = q.data;
  const rsvp = async (status: 'going' | 'interested' | 'none') => {
    try {
      const r = await api.events.rsvp(e.id, status);
      qc.setQueryData(['event', id], { ...e, ...r });
      void attendees.refetch();
      void qc.invalidateQueries({ queryKey: ['events'] });
    } catch (err) {
      toastError(err);
    }
  };
  return (
    <FeatureGate id="events">
      <Stack.Screen
        options={{
          title: e.title,
          headerRight: () => (!e.canEdit ? <ReportButton targetType="event" targetId={e.id} size={20} /> : null),
        }}
      />
      <Screen>
        <Card style={{ gap: 8 }}>
          <Text weight="black" size={21}>
            {e.title}
          </Text>
          <Text weight="bold">{formatDay(e.startsAt, tr, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</Text>
          {e.location ? <Text muted>📍 {e.location}</Text> : null}
          <Text muted>{tr.t('events.hostedBy', { name: e.host.displayName })}</Text>
          {e.description ? <Text>{e.description}</Text> : null}
          <Text muted size={12}>
            {tr.t('events.goingCount', { count: e.goingCount })} · {tr.t('events.interestedCount', { count: e.interestedCount })}
          </Text>
        </Card>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button
              icon="checkmark-circle-outline"
              variant={e.myStatus === 'going' ? 'primary' : 'outline'}
              title={tr.t('events.going')}
              onPress={() => void rsvp(e.myStatus === 'going' ? 'none' : 'going')}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              icon="star-outline"
              variant={e.myStatus === 'interested' ? 'soft' : 'outline'}
              title={tr.t('events.interested')}
              onPress={() => void rsvp(e.myStatus === 'interested' ? 'none' : 'interested')}
            />
          </View>
        </View>
        {e.onlineUrl ? (
          <Button icon="videocam-outline" variant="soft" title={tr.t('events.joinOnline')} onPress={() => void WebBrowser.openBrowserAsync(e.onlineUrl!)} />
        ) : null}
        {e.canEdit && (
          <Button
            variant="danger"
            title={tr.t('common.delete')}
            onPress={async () => {
              if (!(await confirm(tr.t('events.deleteConfirm'), { danger: true }))) return;
              try {
                await api.events.remove(e.id);
                void qc.invalidateQueries({ queryKey: ['events'] });
                router.back();
              } catch (err) {
                toastError(err);
              }
            }}
          />
        )}
        <Text weight="black" size={17}>
          {tr.t('events.attendees')}
        </Text>
        {(attendees.data?.items ?? []).map((a) => (
          <Card key={a.user.id} onPress={() => router.push(`/user/${a.user.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={a.user.displayName} url={a.user.avatarUrl} size={34} />
            <Text weight="bold" style={{ flex: 1 }}>
              {a.user.displayName}
            </Text>
            <Text muted size={12}>
              {a.status === 'going' ? tr.t('events.going') : tr.t('events.interested')}
            </Text>
          </Card>
        ))}
      </Screen>
    </FeatureGate>
  );
}

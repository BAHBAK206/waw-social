import type { Frame } from '@qubedu/api-client';
import type { LiveRoomDto, MessageDto } from '@qubedu/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Circle, Hand, Mic, MicOff, MonitorUp, MonitorX, PenTool, PhoneOff, Send, Settings as SettingsIcon, Users, Video, VideoOff, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ch } from '@/app/channels';
import { Whiteboard, type Stroke } from '@/components/common/Whiteboard';
import { NoticeCard } from '@/components/layout/Banners';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ErrorState, Spinner } from '@/components/ui/States';
import { api, downloadBlob, realtime } from '@/lib/api';
import { cx } from '@/lib/cx';
import { useFeatureOn } from '@/lib/features';
import { relativeTime } from '@/lib/format';
import { errorMessage, useT } from '@/lib/i18n';
import { LiveSession, type RemotePeer } from '@/lib/live';
import { useSession } from '@/lib/session';
import { confirmDialog, toast, toastError } from '@/lib/ui';
import { useRealtimeChannel } from '@/lib/useRealtime';

function Tile({
  stream,
  name,
  muted,
  mic,
  cam,
  hand,
  speaking,
  pinned,
  onPin,
  label,
}: {
  stream: MediaStream | null;
  name: string;
  muted?: boolean;
  mic: boolean;
  cam: boolean;
  hand?: boolean;
  speaking?: boolean;
  pinned?: boolean;
  onPin?: () => void;
  label?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  const showVideo = !!stream && stream.getVideoTracks().length > 0 && (cam || label === 'screen');
  return (
    <div
      className={cx(
        'relative aspect-video overflow-hidden rounded-xl bg-neutral-900 ring-2 transition-shadow',
        speaking ? 'ring-[var(--ok)]' : 'ring-transparent',
        pinned && 'col-span-full row-span-2',
      )}
    >
      <video ref={ref} autoPlay playsInline muted={muted} className={cx('size-full object-contain', !showVideo && 'hidden')} />
      {!showVideo && (
        <div className="absolute inset-0 grid place-items-center">
          <Avatar name={name} size="xl" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-2 text-white">
        {!mic && <MicOff className="size-4 shrink-0 text-red-400" aria-label="muted" />}
        <span className="truncate text-sm font-bold">{name}</span>
        {label === 'screen' && <MonitorUp className="size-4 shrink-0" />}
        {hand && <Hand className="ms-auto size-4 shrink-0 text-yellow-300" aria-label="hand raised" />}
      </div>
      {onPin && (
        <button
          type="button"
          onClick={onPin}
          className="absolute end-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white opacity-0 hover:opacity-100 focus:opacity-100"
          aria-pressed={pinned}
        >
          {pinned ? '–' : '+'}
        </button>
      )}
    </div>
  );
}

function RoomChat({ conversationId }: { conversationId: string }) {
  const tr = useT();
  const qc = useQueryClient();
  const me = useSession((s) => s.me)!;
  const key = ['live-chat', conversationId];
  const q = useQuery({ queryKey: key, queryFn: () => api.chat.messages(conversationId, { limit: 50 }) });
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const messages = useMemo(() => [...(q.data?.items ?? [])].reverse(), [q.data]);
  useRealtimeChannel(ch.conv(conversationId), (f) => {
    if (f.event === 'message:new' || f.event === 'message:updated') void qc.invalidateQueries({ queryKey: key });
  });
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ul className="scroll-thin flex-1 space-y-2 overflow-y-auto p-3" role="log" aria-live="polite">
        {messages.map((m: MessageDto) => (
          <li
            key={m.id}
            className={cx('max-w-[90%] rounded-2xl px-3 py-1.5 text-sm', m.sender.id === me.id ? 'ms-auto bg-primary text-on-primary' : 'bg-bg-3')}
          >
            {m.sender.id !== me.id && <span className="block text-xs font-bold opacity-80">{m.sender.displayName}</span>}
            <span dir="auto" style={{ overflowWrap: 'anywhere' }}>
              {m.deleted ? tr.t('chat.deleted') : m.text}
            </span>
          </li>
        ))}
        <div ref={end} />
      </ul>
      <form
        className="flex gap-2 border-t border-line p-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return;
          setText('');
          try {
            await api.chat.send(conversationId, { text: t, clientId: crypto.randomUUID() });
            await qc.invalidateQueries({ queryKey: key });
          } catch (er) {
            toastError(er);
            setText(t);
          }
        }}
      >
        <input
          className="input h-10 min-h-0 flex-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={tr.t('chat.placeholder')}
          aria-label={tr.t('chat.placeholder')}
          maxLength={1000}
        />
        <Button type="submit" size="sm" className="!size-10 !rounded-full !p-0" aria-label={tr.t('common.send')} disabled={!text.trim()}>
          <Send className="size-4 flip-rtl" />
        </Button>
      </form>
    </div>
  );
}

function RoomSettings({ room, onClose }: { room: LiveRoomDto; onClose: () => void }) {
  const tr = useT();
  const [s, setS] = useState(room.settings);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={tr.t('live.settings.title')}
      footer={
        <Button
          onClick={async () => {
            try {
              await api.live.settings(room.id, s);
              toast(tr.t('common.saved'));
              onClose();
            } catch (e) {
              toastError(e);
            }
          }}
        >
          {tr.t('common.save')}
        </Button>
      }
    >
      <Switch checked={s.allowStudentCamera} onChange={(v) => setS({ ...s, allowStudentCamera: v })} label={tr.t('live.settings.allowStudentCamera')} />
      <Switch checked={s.allowStudentMic} onChange={(v) => setS({ ...s, allowStudentMic: v })} label={tr.t('live.settings.allowStudentMic')} />
      <Switch checked={s.allowStudentScreen} onChange={(v) => setS({ ...s, allowStudentScreen: v })} label={tr.t('live.settings.allowStudentScreen')} />
      <Switch checked={s.allowChat} onChange={(v) => setS({ ...s, allowChat: v })} label={tr.t('live.settings.allowChat')} />
    </Modal>
  );
}

export default function LiveRoomPage() {
  const { roomId = '' } = useParams();
  const tr = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useSession((s) => s.me)!;
  const camOn = useFeatureOn('live-camera');
  const micOn = useFeatureOn('live-microphone');
  const screenOn = useFeatureOn('live-screen-share');
  const boardOn = useFeatureOn('live-whiteboard');
  const recordOn = useFeatureOn('live-record');
  const chatOn = useFeatureOn('live-chat');
  const handOn = useFeatureOn('live-hand');
  const roomQ = useQuery({ queryKey: qk(roomId), queryFn: () => api.live.get(roomId), staleTime: 0, refetchOnWindowFocus: true });
  const room = roomQ.data;
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<LiveSession | null>(null);
  const [, bump] = useState(0);
  const [panel, setPanel] = useState<'chat' | 'people' | 'board' | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recording, setRecording] = useState<MediaRecorder | null>(null);
  const recordingRef = useRef<MediaRecorder | null>(null);
  recordingRef.current = recording;
  const [selfSpeaking, setSelfSpeaking] = useState(false);
  const [removed, setRemoved] = useState(false);

  const canModerate = !!room?.canModerate;
  const canCam = camOn && (canModerate || !!room?.settings.allowStudentCamera);
  const canMic = micOn && (canModerate || !!room?.settings.allowStudentMic);
  const canScreen = screenOn && (canModerate || !!room?.settings.allowStudentScreen);

  const peers: RemotePeer[] = useSyncExternalStore(
    useCallback((cb) => sessionRef.current?.subscribe(cb) ?? (() => undefined), [joined]), // eslint-disable-line react-hooks/exhaustive-deps
    useCallback(() => peerSnapshot(sessionRef.current), []),
  );

  // Load the persisted board for late joiners.
  useEffect(() => {
    if (!joined) return;
    api.live
      .whiteboard(roomId)
      .then((r) => setStrokes(r.strokes as Stroke[]))
      .catch(() => undefined);
  }, [joined, roomId]);

  const leave = useCallback(
    (navigateAway = true) => {
      sessionRef.current?.leave();
      sessionRef.current = null;
      roomUnsub.current?.();
      roomUnsub.current = null;
      setJoined(false);
      if (recordingRef.current && recordingRef.current.state !== 'inactive') recordingRef.current.stop();
      setRecording(null);
      if (navigateAway) navigate(-1);
    },
    [navigate],
  );

  // Room-level events (status, settings, moderation, whiteboard). The subscription itself is created in join(), *before* the
  // media session starts, so the hub's initial peer list is never swallowed by an earlier subscriber.
  const roomHandler = useRef<(f: Frame) => void>(() => undefined);
  roomHandler.current = (f: Frame) => {
    if (f.type !== 'event') return;
    const s = sessionRef.current;
    const d = f.data as Record<string, unknown> | undefined;
    switch (f.event) {
      case 'room:status':
        void qc.invalidateQueries({ queryKey: qk(roomId) });
        if (d?.status === 'ended') {
          toast(tr.t('live.roomEnded'), 'info');
          leave(false);
        }
        break;
      case 'room:settings':
        void qc.invalidateQueries({ queryKey: qk(roomId) });
        break;
      case 'room:moderate': {
        const target = d?.targetUserId as string | undefined;
        const action = d?.action as string;
        const mine = target === me.id;
        if (action === 'mute-all' && !canModerate) s?.setMic(false);
        else if (action === 'lower-all-hands') s?.setHand(false);
        else if (mine && action === 'mute') {
          s?.setMic(false);
          toast(tr.t('live.mutedByHost'), 'info');
        } else if (mine && action === 'camera-off') s?.setCam(false);
        else if (mine && action === 'stop-screen') s?.stopScreen();
        else if (mine && action === 'lower-hand') s?.setHand(false);
        else if (mine && action === 'remove') {
          setRemoved(true);
          leave(false);
          toast(tr.t('live.removed'), 'err');
        }
        break;
      }
      case 'whiteboard':
        setStrokes((prev) => [...prev, d as unknown as Stroke]);
        break;
      case 'whiteboard-clear':
        setStrokes([]);
        break;
      case 'whiteboard-undo':
        setStrokes((prev) => prev.slice(0, -1));
        break;
    }
  };
  const roomUnsub = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      sessionRef.current?.leave();
      sessionRef.current = null;
      roomUnsub.current?.();
      roomUnsub.current = null;
    },
    [],
  );

  const join = async () => {
    if (!room) return;
    setJoining(true);
    setError(null);
    try {
      let local: MediaStream | null = null;
      if (canCam || canMic) {
        try {
          local = await navigator.mediaDevices.getUserMedia({
            video: canCam ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
            audio: canMic ? { echoCancellation: true, noiseSuppression: true } : false,
          });
        } catch {
          toast(tr.t('live.permissionDenied'), 'err');
        }
      }
      realtime.connect();
      const session = new LiveSession(realtime, ch.live(room.id), room.iceServers as RTCIceServer[], () => undefined);
      sessionRef.current = session;
      roomUnsub.current = realtime.subscribe(ch.live(room.id), (f) => roomHandler.current(f));
      session.start(local);
      // Students start muted with the camera off so a room does not begin as noise.
      if (!canModerate) {
        session.setMic(false);
        session.setCam(false);
      }
      session.watchLocalSpeaking(setSelfSpeaking);
      setJoined(true);
      bump((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e, tr));
    } finally {
      setJoining(false);
    }
  };

  const session = sessionRef.current;

  const toggleRecord = async () => {
    if (recording) {
      recording.stop();
      return;
    }
    if (!session) return;
    const tracks: MediaStreamTrack[] = [...session.mixedAudio().getAudioTracks()];
    const video = session.screen?.getVideoTracks()[0] ?? session.local?.getVideoTracks()[0];
    if (video) tracks.push(video);
    const rec = new MediaRecorder(new MediaStream(tracks), {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm',
    });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      downloadBlob(new Blob(chunks, { type: 'video/webm' }), `${room?.title ?? 'class'}.webm`);
      toast(tr.t('live.recordingSaved'));
      setRecording(null);
    };
    rec.start(1000);
    setRecording(rec);
  };

  if (roomQ.isPending) return <Spinner className="py-24" />;
  if (roomQ.error || !room)
    return (
      <div className="page-narrow">
        <ErrorState error={roomQ.error ?? new Error('x')} />
      </div>
    );

  if (removed)
    return (
      <div className="page-narrow">
        <NoticeCard tone="err">{tr.t('live.removed')}</NoticeCard>
      </div>
    );
  if (room.status === 'ended')
    return (
      <div className="page-narrow space-y-4">
        <NoticeCard tone="info">{tr.t('live.roomEnded')}</NoticeCard>
        <Link to="/classes" className="link">
          {tr.t('live.title')}
        </Link>
      </div>
    );

  if (!joined) {
    return (
      <div className="page-narrow">
        <div className="card mx-auto max-w-lg space-y-5 p-8 text-center">
          <div className="surface-gradient mx-auto grid size-16 place-items-center rounded-2xl">
            <Video className="size-8" />
          </div>
          <h1 className="text-2xl font-black" dir="auto">
            {room.title}
          </h1>
          <p className="muted">
            {room.host.displayName} · {room.status === 'live' ? tr.t('live.liveNow') : tr.t('live.scheduled')}
          </p>
          {error && <NoticeCard tone="err">{error}</NoticeCard>}
          {room.status !== 'live' && !room.canModerate && <NoticeCard tone="info">{tr.t('live.notStarted')}</NoticeCard>}
          {room.status !== 'live' && room.canModerate && (
            <Button
              size="lg"
              block
              onClick={async () => {
                try {
                  await api.live.start(room.id);
                  await roomQ.refetch();
                } catch (e) {
                  toastError(e);
                }
              }}
            >
              {tr.t('live.start')}
            </Button>
          )}
          <Button
            size="lg"
            block
            variant={room.status === 'live' ? 'primary' : 'outline'}
            loading={joining}
            disabled={room.status !== 'live'}
            onClick={() => void join()}
          >
            {tr.t('live.join')}
          </Button>
        </div>
      </div>
    );
  }

  const tiles: {
    key: string;
    stream: MediaStream | null;
    name: string;
    mic: boolean;
    cam: boolean;
    hand?: boolean;
    speaking?: boolean;
    muted?: boolean;
    label?: string;
  }[] = [];
  if (session?.screen)
    tiles.push({
      key: 'self-screen',
      stream: session.screen,
      name: `${me.displayName} (${tr.t('live.screen')})`,
      mic: true,
      cam: true,
      muted: true,
      label: 'screen',
    });
  tiles.push({
    key: 'self',
    stream: session?.local ?? null,
    name: `${me.displayName} (${tr.t('live.you')})`,
    mic: session?.media.mic ?? false,
    cam: session?.media.cam ?? false,
    hand: session?.hand,
    speaking: selfSpeaking,
    muted: true,
  });
  for (const p of peers) {
    const screenStream = p.streams.find((s) => s.id === p.media.screen);
    const cameraStream = p.streams.find((s) => s.id !== p.media.screen) ?? null;
    if (screenStream)
      tiles.push({ key: `${p.connId}-screen`, stream: screenStream, name: `${p.name} (${tr.t('live.screen')})`, mic: true, cam: true, label: 'screen' });
    tiles.push({ key: p.connId, stream: cameraStream, name: p.name, mic: p.media.mic, cam: p.media.cam, hand: p.hand, speaking: p.speaking });
  }
  // Screen shares are the focus by default.
  const focus = pinned ?? tiles.find((t) => t.label === 'screen')?.key ?? null;
  const participants = [
    { id: me.id, connId: 'self', name: me.displayName, hand: session?.hand ?? false, mic: session?.media.mic ?? false },
    ...peers.map((p) => ({ id: p.uid, connId: p.connId, name: p.name, hand: p.hand, mic: p.media.mic })),
  ];
  const raised = participants.filter((p) => p.hand);

  const btn = (active: boolean, danger = false) =>
    cx('icon-btn !size-12 !rounded-full border border-line', active ? (danger ? 'bg-err-fill text-white' : 'bg-primary text-on-primary') : 'bg-card');

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg lg:start-0">
      <header className="flex items-center gap-3 border-b border-line bg-card px-4 py-2">
        <span className="size-2.5 animate-pulse rounded-full bg-err-fill" aria-hidden />
        <h1 className="min-w-0 flex-1 truncate font-black" dir="auto">
          {room.title}
        </h1>
        {raised.length > 0 && (
          <span className="badge badge-warn">
            <Hand className="size-3.5" /> {raised.length}
          </span>
        )}
        {recording && (
          <span className="badge badge-err">
            <Circle className="size-3 fill-current" /> REC
          </span>
        )}
        <span className="muted text-sm">{tr.t('live.participants', { count: participants.length })}</span>
        {canModerate && (
          <Button size="sm" variant="ghost" icon={<SettingsIcon className="size-4" />} onClick={() => setSettingsOpen(true)}>
            <span className="sr-only">{tr.t('live.settings.title')}</span>
          </Button>
        )}
      </header>
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-y-auto p-3">
          <div
            className={cx(
              'grid gap-3',
              focus
                ? 'grid-cols-2 md:grid-cols-4'
                : tiles.length <= 1
                  ? 'grid-cols-1'
                  : tiles.length <= 4
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
            )}
          >
            {[...tiles]
              .sort((a, b) => (a.key === focus ? -1 : b.key === focus ? 1 : 0))
              .map((t) => (
                <div key={t.key} className={cx(t.key === focus && 'col-span-full md:col-span-4')}>
                  <Tile {...t} pinned={t.key === focus} onPin={() => setPinned(pinned === t.key ? null : t.key)} />
                </div>
              ))}
          </div>
        </main>
        {panel && (
          <aside
            className="flex w-full max-w-sm shrink-0 flex-col border-s border-line bg-card max-md:absolute max-md:inset-y-12 max-md:end-0 max-md:z-10 max-md:bottom-20"
            aria-label={panel}
          >
            <div className="flex items-center border-b border-line p-2">
              <h2 className="flex-1 ps-2 font-black">
                {panel === 'chat' ? tr.t('live.chat') : panel === 'people' ? tr.t('live.participants', { count: participants.length }) : tr.t('live.board')}
              </h2>
              <button type="button" className="icon-btn icon-btn-sm" aria-label={tr.t('common.close')} onClick={() => setPanel(null)}>
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {panel === 'chat' &&
                (room.settings.allowChat && room.conversationId ? (
                  <RoomChat conversationId={room.conversationId} />
                ) : (
                  <p className="muted p-4">{tr.t('errors.chat_disabled')}</p>
                ))}
              {panel === 'people' && (
                <ul className="divide-y divide-line">
                  {participants.map((p) => (
                    <li key={p.connId} className="flex items-center gap-2 p-3">
                      <Avatar name={p.name} size="sm" />
                      <span className="min-w-0 flex-1 truncate font-bold">{p.name}</span>
                      {p.hand && <Hand className="size-4 text-warn" />}
                      {!p.mic && <MicOff className="size-4 text-fg-3" />}
                      {canModerate && p.connId !== 'self' && (
                        <>
                          <button
                            type="button"
                            className="chip !min-h-7 !px-2 text-xs"
                            onClick={() => void api.live.moderate(room.id, 'mute', p.id).catch(toastError)}
                          >
                            {tr.t('live.moderation.mute')}
                          </button>
                          {p.hand && (
                            <button
                              type="button"
                              className="chip !min-h-7 !px-2 text-xs"
                              onClick={() => void api.live.moderate(room.id, 'lower-hand', p.id).catch(toastError)}
                            >
                              {tr.t('live.moderation.lowerHand')}
                            </button>
                          )}
                          <button
                            type="button"
                            className="chip !min-h-7 !px-2 text-xs text-err"
                            onClick={async () => {
                              if (await confirmDialog({ title: tr.t('live.moderation.remove'), danger: true }))
                                void api.live.moderate(room.id, 'remove', p.id).catch(toastError);
                            }}
                          >
                            ✕
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                  {canModerate && (
                    <li className="flex gap-2 p-3">
                      <Button size="sm" variant="outline" onClick={() => void api.live.moderate(room.id, 'mute-all').catch(toastError)}>
                        {tr.t('live.moderation.muteAll')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void api.live.moderate(room.id, 'lower-all-hands').catch(toastError)}>
                        {tr.t('live.moderation.lowerAll')}
                      </Button>
                    </li>
                  )}
                </ul>
              )}
              {panel === 'board' && boardOn && (
                <div className="p-2">
                  <Whiteboard
                    strokes={strokes}
                    readOnly={!canModerate}
                    onStroke={(s) => {
                      setStrokes((p) => [...p, s]);
                      realtime.publish(ch.live(room.id), 'whiteboard', s);
                      void api.live.saveWhiteboard(room.id, [...strokes, s]).catch(() => undefined);
                    }}
                    onReplace={(next, reason) => {
                      setStrokes(next);
                      realtime.publish(ch.live(room.id), reason === 'clear' ? 'whiteboard-clear' : 'whiteboard-undo');
                      void api.live.saveWhiteboard(room.id, next).catch(() => undefined);
                    }}
                  />
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
      <footer className="safe-bottom flex flex-wrap items-center justify-center gap-2 border-t border-line bg-card p-2">
        <button
          type="button"
          className={btn(!(session?.media.mic ?? false), true)}
          disabled={!canMic || !session?.local?.getAudioTracks().length}
          onClick={() => session?.setMic(!session.media.mic)}
          aria-label={session?.media.mic ? tr.t('live.mic') + ' off' : tr.t('live.mic')}
          aria-pressed={session?.media.mic}
        >
          {session?.media.mic ? <Mic className="size-5" /> : <MicOff className="size-5" />}
        </button>
        <button
          type="button"
          className={btn(!(session?.media.cam ?? false), true)}
          disabled={!canCam || !session?.local?.getVideoTracks().length}
          onClick={() => session?.setCam(!session.media.cam)}
          aria-label={tr.t('live.camera')}
          aria-pressed={session?.media.cam}
        >
          {session?.media.cam ? <Video className="size-5" /> : <VideoOff className="size-5" />}
        </button>
        {canScreen && (
          <button
            type="button"
            className={btn(!!session?.screen)}
            aria-pressed={!!session?.screen}
            aria-label={session?.screen ? tr.t('live.stopScreen') : tr.t('live.screen')}
            onClick={async () => {
              try {
                if (session?.screen) session.stopScreen();
                else await session?.startScreen();
                bump((n) => n + 1);
              } catch {
                /* user cancelled the picker */
              }
            }}
          >
            {session?.screen ? <MonitorX className="size-5" /> : <MonitorUp className="size-5" />}
          </button>
        )}
        {handOn && (
          <button
            type="button"
            className={btn(!!session?.hand)}
            aria-pressed={!!session?.hand}
            aria-label={session?.hand ? tr.t('live.lowerHand') : tr.t('live.hand')}
            onClick={() => session?.setHand(!session.hand)}
          >
            <Hand className="size-5" />
          </button>
        )}
        {boardOn && (
          <button
            type="button"
            className={btn(panel === 'board')}
            aria-label={tr.t('live.board')}
            aria-pressed={panel === 'board'}
            onClick={() => setPanel(panel === 'board' ? null : 'board')}
          >
            <PenTool className="size-5" />
          </button>
        )}
        {chatOn && (
          <button
            type="button"
            className={btn(panel === 'chat')}
            aria-label={tr.t('live.chat')}
            aria-pressed={panel === 'chat'}
            onClick={() => setPanel(panel === 'chat' ? null : 'chat')}
          >
            <Send className="size-5" />
          </button>
        )}
        <button
          type="button"
          className={btn(panel === 'people')}
          aria-label={tr.t('live.participants', { count: participants.length })}
          aria-pressed={panel === 'people'}
          onClick={() => setPanel(panel === 'people' ? null : 'people')}
        >
          <Users className="size-5" />
        </button>
        {recordOn && canModerate && (
          <button
            type="button"
            className={btn(!!recording, true)}
            aria-label={recording ? tr.t('live.stopRecord') : tr.t('live.record')}
            aria-pressed={!!recording}
            onClick={() => void toggleRecord()}
          >
            <Circle className="size-5" />
          </button>
        )}
        <button
          type="button"
          className="icon-btn !size-12 !w-16 !rounded-full bg-err-fill text-white hover:bg-err-fill"
          aria-label={tr.t('live.leave')}
          onClick={() => leave()}
        >
          <PhoneOff className="size-5" />
        </button>
        {canModerate && (
          <Button
            size="sm"
            variant="ghost"
            className="text-err"
            onClick={async () => {
              if (!(await confirmDialog({ title: tr.t('live.end'), danger: true, confirmLabel: tr.t('live.end') }))) return;
              try {
                await api.live.end(room.id);
                leave();
              } catch (e) {
                toastError(e);
              }
            }}
          >
            {tr.t('live.end')}
          </Button>
        )}
      </footer>
      {settingsOpen && (
        <RoomSettings
          room={room}
          onClose={() => {
            setSettingsOpen(false);
            void roomQ.refetch();
          }}
        />
      )}
    </div>
  );
}

const qk = (id: string) => ['live', id] as const;

const NO_PEERS: RemotePeer[] = [];
let lastSession: LiveSession | null = null;
let lastSnap: RemotePeer[] = [];
let lastRev = '';
/** useSyncExternalStore needs a stable snapshot: rebuild only when something actually changed. */
function peerSnapshot(s: LiveSession | null): RemotePeer[] {
  if (!s) return NO_PEERS;
  const fresh = s.snapshot();
  const rev = fresh
    .map((p) => `${p.connId}:${p.streams.map((x) => x.id).join(',')}:${p.media.mic}${p.media.cam}${p.media.screen}:${p.hand}${p.speaking}:${p.state}`)
    .join('|');
  if (s !== lastSession || rev !== lastRev) {
    lastSession = s;
    lastRev = rev;
    lastSnap = fresh;
  }
  return lastSnap;
}

export { relativeTime };

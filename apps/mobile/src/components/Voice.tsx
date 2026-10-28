import { Ionicons } from '@expo/vector-icons';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui';
import { formatClock } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { toast } from '@/lib/ui';

/** Plays an audio attachment (voice note) inline. */
export function VoicePlayer({ uri, color }: { uri: string; color: string }) {
  const tr = useT();
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  return (
    <Pressable
      onPress={() => {
        if (playing) player.pause();
        else {
          if (status.didJustFinish || (status.duration && status.currentTime >= status.duration - 0.1)) void player.seekTo(0);
          player.play();
        }
      }}
      accessibilityRole="button"
      accessibilityLabel={playing ? tr.t('academic.focus.pause') : tr.t('chat.record')}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 150 }}
    >
      <Ionicons name={playing ? 'pause-circle' : 'play-circle'} size={32} color={color} />
      <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: `${color}55` }}>
        <View
          style={{
            height: 4,
            borderRadius: 2,
            backgroundColor: color,
            width: `${status.duration ? Math.min(100, (status.currentTime / status.duration) * 100) : 0}%`,
          }}
        />
      </View>
      <Text size={11} color={color}>
        {formatClock(playing ? status.currentTime : status.duration || 0)}
      </Text>
    </Pressable>
  );
}

/** Tap to record, tap again to send. Calls onRecorded with the local file. */
export function VoiceRecorder({ onRecorded, disabled }: { onRecorded: (file: { uri: string; seconds: number }) => void; disabled?: boolean }) {
  const tr = useT();
  const t = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const started = useRef(0);
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSeconds(Math.round((Date.now() - started.current) / 1000)), 500);
    return () => clearInterval(id);
  }, [recording]);

  const toggle = async () => {
    if (recording) {
      await recorder.stop();
      setRecording(false);
      await setAudioModeAsync({ allowsRecording: false });
      const secs = Math.round((Date.now() - started.current) / 1000);
      if (recorder.uri && secs >= 1) onRecorded({ uri: recorder.uri, seconds: secs });
      return;
    }
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) return toast(tr.t('lab.micDenied'), 'err');
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    started.current = Date.now();
    setSeconds(0);
    setRecording(true);
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {recording && (
        <Text size={12} weight="bold" color={t.err}>
          ● {formatClock(seconds)}
        </Text>
      )}
      <Pressable
        disabled={disabled}
        onPress={() => void toggle()}
        accessibilityRole="button"
        accessibilityLabel={recording ? tr.t('chat.recording') : tr.t('chat.record')}
        style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: recording ? t.errFill : t.bg3 }}
      >
        <Ionicons name={recording ? 'stop' : 'mic-outline'} size={21} color={recording ? '#fff' : t.primaryInk} />
      </Pressable>
    </View>
  );
}

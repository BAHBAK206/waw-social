import { SPEECH_LOCALE, type LabLanguage } from '@qubedu/shared';

import type * as SpeechRecognition from 'expo-speech-recognition';

type Module = typeof SpeechRecognition;
let loaded: Module | null | undefined;

/** The native module only exists in development/production builds (not Expo Go), so it is loaded lazily. */
function mod(): Module | null {
  if (loaded !== undefined) return loaded;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('expo-speech-recognition') as Module;
  } catch {
    loaded = null;
  }
  return loaded;
}

export function canRecognize(): boolean {
  try {
    return !!mod()?.ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

export class MicDeniedError extends Error {}

/** Listens once in the given language; resolves with what was heard (empty when nothing was said). */
export async function listen(lang: LabLanguage, onPartial: (text: string) => void): Promise<{ result: Promise<string>; stop: () => void }> {
  const m = mod()!.ExpoSpeechRecognitionModule;
  const perm = await m.requestPermissionsAsync();
  if (!perm.granted) throw new MicDeniedError('mic-denied');
  let heard = '';
  const subs: { remove: () => void }[] = [];
  const result = new Promise<string>((resolve, reject) => {
    subs.push(
      m.addListener('result', (e) => {
        heard = e.results[0]?.transcript ?? heard;
        onPartial(heard);
      }),
      m.addListener('error', (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted' || e.error === 'speech-timeout') resolve(heard);
        else reject(new Error(e.error));
      }),
      m.addListener('end', () => resolve(heard)),
    );
  }).finally(() => subs.forEach((s) => s.remove()));
  m.start({ lang: SPEECH_LOCALE[lang], interimResults: true, continuous: false, maxAlternatives: 1 });
  return { result, stop: () => m.stop() };
}

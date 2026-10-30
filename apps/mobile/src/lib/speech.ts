import { detectTextLanguage, SPEECH_LOCALE, type LabLanguage } from '@qubedu/shared';
import * as Speech from 'expo-speech';
import { create } from 'zustand';

/** Which piece of text is being read right now (so only that button shows "stop"). */
export const useSpeaking = create<{ id: string | null }>(() => ({ id: null }));

export function stopSpeaking() {
  void Speech.stop();
  useSpeaking.setState({ id: null });
}

/** Reads text aloud in its own language (detected from the script, falling back to the app language). */
export function speak(text: string, id: string, fallback: LabLanguage, rate = 1) {
  void Speech.stop();
  const language = SPEECH_LOCALE[detectTextLanguage(text, fallback)];
  useSpeaking.setState({ id });
  const clear = () => {
    if (useSpeaking.getState().id === id) useSpeaking.setState({ id: null });
  };
  Speech.speak(text, {
    language,
    rate,
    onDone: clear,
    onStopped: clear,
    onError: () => useSpeaking.setState({ id: null }),
  });
}

import { detectTextLanguage, SPEECH_LOCALE, type LabLanguage } from '@qubedu/shared';
import { create } from 'zustand';
import { useAppearance } from './appearance';

const RATE_KEY = 'qubedu:speech-rate';

interface SpeechState {
  /** Id of the element currently being read aloud (one at a time). */
  speakingId: string | null;
  rate: number;
  setRate: (r: number) => void;
}

function loadRate() {
  try {
    const r = Number(localStorage.getItem(RATE_KEY));
    return r >= 0.5 && r <= 1.5 ? r : 1;
  } catch {
    return 1;
  }
}

export const useSpeech = create<SpeechState>((set) => ({
  speakingId: null,
  rate: typeof window !== 'undefined' ? loadRate() : 1,
  setRate: (rate) => {
    try {
      localStorage.setItem(RATE_KEY, String(rate));
    } catch {
      /* ignore */
    }
    set({ rate });
  },
}));

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';

function pickVoice(locale: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const lang = locale.split('-')[0]!;
  return voices.find((v) => v.lang === locale) ?? voices.find((v) => v.lang.toLowerCase().startsWith(lang));
}

/** Reads text aloud with a voice matching its language (auto-detected unless given). Resolves when finished or stopped. */
export function speak(text: string, opts: { lang?: LabLanguage; id?: string; rate?: number } = {}): Promise<void> {
  if (!canSpeak() || !text.trim()) return Promise.resolve();
  const synth = window.speechSynthesis;
  synth.cancel();
  const lang = opts.lang ?? detectTextLanguage(text, useAppearance.getState().appearance.language);
  const locale = SPEECH_LOCALE[lang];
  const u = new SpeechSynthesisUtterance(text);
  u.lang = locale;
  const voice = pickVoice(locale);
  if (voice) u.voice = voice;
  u.rate = opts.rate ?? useSpeech.getState().rate;
  const id = opts.id ?? null;
  useSpeech.setState({ speakingId: id });
  return new Promise((resolve) => {
    const done = () => {
      if (useSpeech.getState().speakingId === id) useSpeech.setState({ speakingId: null });
      resolve();
    };
    u.onend = done;
    u.onerror = done;
    synth.speak(u);
  });
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
  useSpeech.setState({ speakingId: null });
}

/** Browser speech recognition (Chromium, Safari). Firefox has none: the lab then offers listen-and-repeat only. */
type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canRecognize = () => recognitionCtor() !== null;

export interface Listening {
  /** Resolves with everything heard (best alternatives joined); rejects with an error code ('not-allowed', 'no-speech', ...). */
  result: Promise<string>;
  stop: () => void;
}

/** Listens once in `lang`, calling `onPartial` with interim text. */
export function listen(lang: LabLanguage, onPartial?: (text: string) => void): Listening {
  const Ctor = recognitionCtor();
  if (!Ctor) return { result: Promise.reject(new Error('unsupported')), stop: () => undefined };
  const rec = new Ctor();
  rec.lang = SPEECH_LOCALE[lang];
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.continuous = false;
  let finalText = '';
  const result = new Promise<string>((resolve, reject) => {
    rec.onresult = (e) => {
      let interim = '';
      finalText = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (r.isFinal) finalText += `${r[0]!.transcript} `;
        else interim += r[0]!.transcript;
      }
      onPartial?.((finalText + interim).trim());
    };
    rec.onerror = (e) => (e.error === 'no-speech' ? resolve('') : reject(new Error(e.error)));
    rec.onend = () => resolve(finalText.trim());
  });
  stopSpeaking();
  rec.start();
  return { result, stop: () => rec.stop() };
}

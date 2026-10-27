import { Alert } from 'react-native';
import { create } from 'zustand';
import { currentT, errorMessage } from './i18n';

interface ToastState {
  text: string | null;
  kind: 'ok' | 'err';
  show: (text: string, kind?: 'ok' | 'err') => void;
  hide: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useToast = create<ToastState>((set) => ({
  text: null,
  kind: 'ok',
  show: (text, kind = 'ok') => {
    if (timer) clearTimeout(timer);
    set({ text, kind });
    timer = setTimeout(() => set({ text: null }), 3200);
  },
  hide: () => set({ text: null }),
}));

export const toast = (text: string, kind: 'ok' | 'err' = 'ok') => useToast.getState().show(text, kind);
export const toastError = (err: unknown) => toast(errorMessage(err), 'err');

export function confirm(title: string, opts: { danger?: boolean; confirmLabel?: string } = {}): Promise<boolean> {
  const tr = currentT();
  return new Promise((resolve) => {
    Alert.alert(
      title,
      undefined,
      [
        { text: tr.t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: opts.confirmLabel ?? tr.t('common.confirm'), style: opts.danger ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

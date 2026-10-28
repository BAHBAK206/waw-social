import type { Env } from '../env';

/** What a message is for: WhatsApp needs a pre-approved template for each kind outside a 24-hour chat window. */
export type MessageKind = 'code' | 'weekly' | 'alert';

export interface OutboundMessage {
  to: string;
  channel: 'whatsapp' | 'sms';
  kind: MessageKind;
  /** The full text (SMS, and WhatsApp when no template is configured). */
  text: string;
  /** Values for the WhatsApp template's {{1}}, {{2}}… in order. */
  params: string[];
  /** Template language (ar, en, fr, es). */
  lang: string;
}

export interface Messenger {
  available: { whatsapp: boolean; sms: boolean };
  send(msg: OutboundMessage): Promise<void>;
  /** Messages kept in tests and local runs without a provider. */
  readonly outbox: OutboundMessage[];
}

type Log = { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void };

/**
 * WhatsApp through the WhatsApp Business Cloud API (Meta), SMS through Twilio. Without providers, messages are printed
 * to the log (and kept in `outbox`) outside production, so the whole flow can be tried locally.
 */
export function createMessenger(env: Env, log: Log): Messenger {
  const outbox: OutboundMessage[] = [];
  const wa = !!env.WHATSAPP_TOKEN && !!env.WHATSAPP_PHONE_NUMBER_ID;
  const sms = !!env.TWILIO_ACCOUNT_SID && !!env.TWILIO_AUTH_TOKEN && !!(env.TWILIO_FROM || env.TWILIO_MESSAGING_SERVICE_SID);
  const dev = env.NODE_ENV !== 'production';
  const keep = (m: OutboundMessage) => {
    outbox.push(m);
    if (outbox.length > 100) outbox.shift();
  };
  return {
    outbox,
    available: { whatsapp: wa || dev, sms: sms || dev },
    async send(m) {
      if (env.NODE_ENV === 'test' && !(m.channel === 'whatsapp' ? wa : sms)) return keep(m);
      if (m.channel === 'whatsapp' && wa) return sendWhatsApp(env, m);
      if (m.channel === 'sms' && sms) return sendTwilio(env, m);
      if (dev) {
        keep(m);
        log.info({ to: m.to, channel: m.channel, text: m.text }, 'message (no provider configured — printed instead of sent)');
        return;
      }
      throw new Error('channel_unavailable');
    },
  };
}

const TEMPLATE: Record<MessageKind, keyof Env> = {
  code: 'WHATSAPP_TEMPLATE_CODE',
  weekly: 'WHATSAPP_TEMPLATE_WEEKLY',
  alert: 'WHATSAPP_TEMPLATE_ALERT',
};

async function sendWhatsApp(env: Env, m: OutboundMessage): Promise<void> {
  const template = env[TEMPLATE[m.kind]] as string | undefined;
  const body = template
    ? {
        messaging_product: 'whatsapp',
        to: m.to.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: template,
          language: { code: m.lang },
          components: [
            { type: 'body', parameters: m.params.map((text) => ({ type: 'text', text })) },
            // Authentication templates carry the code again in their "copy code" button.
            ...(m.kind === 'code' ? [{ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: m.params[0] }] }] : []),
          ],
        },
      }
    : { messaging_product: 'whatsapp', to: m.to.replace(/^\+/, ''), type: 'text', text: { body: m.text } };
  const res = await fetch(`${env.WHATSAPP_API_URL.replace(/\/$/, '')}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`whatsapp_${res.status}`);
}

async function sendTwilio(env: Env, m: OutboundMessage): Promise<void> {
  const form = new URLSearchParams({ To: m.to, Body: m.text });
  if (env.TWILIO_MESSAGING_SERVICE_SID) form.set('MessagingServiceSid', env.TWILIO_MESSAGING_SERVICE_SID);
  else form.set('From', env.TWILIO_FROM!);
  const res = await fetch(`${env.TWILIO_API_URL.replace(/\/$/, '')}/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`sms_${res.status}`);
}

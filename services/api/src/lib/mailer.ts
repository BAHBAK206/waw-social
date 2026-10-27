import nodemailer from 'nodemailer';
import type { Env } from '../env';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
  readonly outbox: Mail[];
}

export function createMailer(env: Env, log: { info: (o: object, m?: string) => void }): Mailer {
  const outbox: Mail[] = [];
  const transport = env.SMTP_HOST
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      })
    : null;
  return {
    outbox,
    async send(mail) {
      if (env.NODE_ENV === 'test') {
        outbox.push(mail);
        if (outbox.length > 100) outbox.shift();
        return;
      }
      if (!transport) {
        log.info({ to: mail.to, subject: mail.subject, text: mail.text }, 'mail (SMTP not configured — printed instead of sent)');
        return;
      }
      await transport.sendMail({ from: env.MAIL_FROM, ...mail });
    },
  };
}

export function emailTemplate(title: string, body: string, actionLabel: string, actionUrl: string, dir: 'rtl' | 'ltr') {
  const text = `${title}\n\n${body}\n\n${actionLabel}: ${actionUrl}`;
  const html = `<!doctype html><html dir="${dir}"><body style="margin:0;background:#f0f2f5;font-family:Tajawal,Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:18px;padding:32px">
<tr><td style="font-size:22px;font-weight:800;color:#4834d4">Qubedu</td></tr>
<tr><td style="padding-top:16px;font-size:18px;font-weight:700;color:#2d3436">${title}</td></tr>
<tr><td style="padding-top:8px;font-size:15px;line-height:1.7;color:#555f64">${body}</td></tr>
<tr><td style="padding-top:24px"><a href="${actionUrl}" style="display:inline-block;background:#6c5ce7;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:700">${actionLabel}</a></td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}

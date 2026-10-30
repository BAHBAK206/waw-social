import { Mail, MapPin, MessageCircle, Phone, Send } from 'lucide-react';
import { useSession } from '@/lib/session';
import { InfoShell, useInfo } from './InfoShell';

const SOCIAL: { key: string; label: string; href: (v: string) => string }[] = [
  { key: 'facebook', label: 'Facebook', href: (v) => (v.startsWith('http') ? v : `https://facebook.com/${v}`) },
  { key: 'instagram', label: 'Instagram', href: (v) => (v.startsWith('http') ? v : `https://instagram.com/${v.replace(/^@/, '')}`) },
  { key: 'telegram', label: 'Telegram', href: (v) => (v.startsWith('http') ? v : `https://t.me/${v.replace(/^@/, '')}`) },
];

export default function ContactPage() {
  const page = useInfo().contact;
  const contact = useSession((s) => s.config?.contact ?? {});
  const row = (icon: React.ReactNode, label: string, value: string, href: string) => (
    <a
      key={label}
      href={href}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel="noopener noreferrer"
      className="card flex items-center gap-3 p-4 hover:shadow-lg"
    >
      <span className="surface-gradient grid size-10 place-items-center rounded-xl">{icon}</span>
      <span className="min-w-0">
        <span className="muted block text-xs">{label}</span>
        <span className="block truncate font-bold" dir="ltr">
          {value}
        </span>
      </span>
    </a>
  );
  const phone = contact.phone?.trim();
  const whatsapp = contact.whatsapp?.trim();
  const email = contact.email?.trim();
  const address = contact.address?.trim();
  const rows = [
    email && row(<Mail className="size-5" />, page.emailLabel, email, `mailto:${email}`),
    phone && row(<Phone className="size-5" />, 'Phone', phone, `tel:${phone.replace(/\s/g, '')}`),
    whatsapp && row(<MessageCircle className="size-5" />, 'WhatsApp', whatsapp, `https://wa.me/${whatsapp.replace(/\D/g, '')}`),
    ...SOCIAL.map((s) => contact[s.key]?.trim() && row(<Send className="size-5" />, s.label, contact[s.key]!.trim(), s.href(contact[s.key]!.trim()))),
  ].filter(Boolean);
  return (
    <InfoShell title={page.title} intro={page.intro}>
      {rows.length ? <div className="grid gap-3 sm:grid-cols-2">{rows}</div> : <p className="muted rounded-xl bg-soft p-4">{page.noEmailNotice}</p>}
      {address && (
        <p className="flex items-center gap-2">
          <MapPin className="size-4" /> {address}
        </p>
      )}
      <section>
        <h2 className="mb-2 text-xl font-black">{page.topicsTitle}</h2>
        <ul className="list-disc space-y-1 ps-6">
          {page.topics.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>
      <p className="muted text-sm">{page.responseNote}</p>
    </InfoShell>
  );
}

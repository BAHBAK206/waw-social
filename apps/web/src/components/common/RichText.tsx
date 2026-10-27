import { Fragment } from 'react';
import { Link } from 'react-router';

const TOKEN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'’])|(^|[\s(])#([\p{L}\p{N}_]{2,40})/gu;

/** Renders plain text with clickable #hashtags and links. Never injects HTML. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    if (m[1]) {
      nodes.push(text.slice(last, start));
      const href = m[1];
      let safe = false;
      try {
        safe = ['http:', 'https:'].includes(new URL(href).protocol);
      } catch {
        safe = false;
      }
      nodes.push(
        safe ? (
          <a key={i++} href={href} target="_blank" rel="noopener noreferrer nofollow ugc" className="link break-all">
            {href}
          </a>
        ) : (
          href
        ),
      );
      last = start + m[0].length;
    } else if (m[3]) {
      nodes.push(text.slice(last, start), m[2] ?? '');
      nodes.push(
        <Link key={i++} to={`/explore/tag/${encodeURIComponent(m[3].toLowerCase())}`} className="link">
          #{m[3]}
        </Link>,
      );
      last = start + m[0].length;
    }
  }
  nodes.push(text.slice(last));
  return (
    <p className={className} dir="auto" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
      {nodes.map((n, k) => (
        <Fragment key={k}>{n}</Fragment>
      ))}
    </p>
  );
}

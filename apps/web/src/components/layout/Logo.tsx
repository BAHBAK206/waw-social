import { Link } from 'react-router';
import { cx } from '@/lib/cx';

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <Link to="/" className={cx('inline-flex items-center gap-2.5', className)} aria-label="Qubedu">
      <img src="/brand/qubedu-mark.svg" alt="" className="size-9 rounded-xl" width={36} height={36} />
      <span className={cx('text-xl font-black tracking-tight', light ? 'text-white' : 'text-fg')} dir="ltr">
        Qubedu
      </span>
    </Link>
  );
}

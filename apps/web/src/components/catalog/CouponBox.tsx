import type { CatalogCourseDto, CouponPreviewDto } from '@qubedu/shared';
import { Tag } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { api } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { toastError } from '@/lib/ui';

export interface AppliedCoupon {
  code: string;
  preview: CouponPreviewDto;
}

/** "Have a discount code?" — shows the price after the code, before the student pays. */
export function CouponBox({ c, applied, onApplied }: { c: CatalogCourseDto; applied: AppliedCoupon | null; onApplied: (a: AppliedCoupon | null) => void }) {
  const tr = useT();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const check = () => {
    setBusy(true);
    api.coupons
      .preview(c.id, code.trim())
      .then((preview) => onApplied({ code: code.trim().toUpperCase(), preview }))
      .catch((e) => {
        onApplied(null);
        toastError(e);
      })
      .finally(() => setBusy(false));
  };
  return (
    <div className="space-y-2">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          check();
        }}
      >
        <Input
          label={tr.t('payments.couponLabel')}
          value={code}
          dir="ltr"
          className="font-mono uppercase"
          maxLength={20}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          wrapperClassName="w-56"
        />
        <Button type="submit" variant="outline" icon={<Tag className="size-4" />} loading={busy} disabled={code.trim().length < 4}>
          {tr.t('payments.couponApply')}
        </Button>
      </form>
      {applied && (
        <p className="text-sm font-bold text-ok" role="status">
          {applied.preview.finalCents === 0
            ? tr.t('payments.couponFree')
            : tr.t('payments.couponApplied', {
                discount: formatPrice(applied.preview.discountCents, applied.preview.currency, tr),
                final: formatPrice(applied.preview.finalCents, applied.preview.currency, tr),
              })}
        </p>
      )}
    </div>
  );
}

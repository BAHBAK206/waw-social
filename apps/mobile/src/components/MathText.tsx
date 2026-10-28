import { latexToText, splitMath } from '@qubedu/shared';
import { Fragment, useMemo } from 'react';
import { Text } from 'react-native';
import { useTheme } from '@/lib/theme';

/**
 * Text with `$…$` / `$$…$$` formulas, for use inside a <Text>. Formulas show as readable math (x², √x, ½ as 1/2,
 * Greek letters), left to right and in a serif face so they stand out; it works offline and costs nothing per row.
 */
export function MathText({ text }: { text: string }) {
  const t = useTheme();
  const parts = useMemo(() => splitMath(text), [text]);
  if (parts.length === 1 && parts[0]!.kind === 'text') return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'text' ? (
          <Fragment key={i}>{p.value}</Fragment>
        ) : (
          <Text key={i} accessibilityRole="text" style={{ fontFamily: 'serif', fontStyle: 'italic', color: t.primary, writingDirection: 'ltr' }}>
            {p.display ? `\n${latexToText(p.value)}\n` : `⁦${latexToText(p.value)}⁩`}
          </Text>
        ),
      )}
    </>
  );
}

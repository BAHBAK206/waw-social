import { InfoShell, Sections, useInfo } from './InfoShell';

export default function TermsPage() {
  const page = useInfo().terms;
  return (
    <InfoShell title={page.title} intro={page.intro}>
      <Sections page={page} />
    </InfoShell>
  );
}

import { InfoShell, Sections, useInfo } from './InfoShell';

export default function PrivacyPage() {
  const page = useInfo().privacy;
  return (
    <InfoShell title={page.title} intro={page.intro}>
      <Sections page={page} />
    </InfoShell>
  );
}

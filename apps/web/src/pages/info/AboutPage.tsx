import { InfoShell, Sections, useInfo } from './InfoShell';

export default function AboutPage() {
  const page = useInfo().about;
  return (
    <InfoShell title={page.title} intro={page.intro}>
      <Sections page={page} />
    </InfoShell>
  );
}

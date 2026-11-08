/** Heading ids of the manual's sections, in order, with the i18n key of each title. */
export const SECTIONS = [
  { id: 'manual-first', title: 'help.first.title' },
  { id: 'manual-views', title: 'help.views.title' },
  { id: 'manual-calc', title: 'help.calc.title' },
  { id: 'manual-where', title: 'help.where.title' },
  { id: 'manual-templates', title: 'help.templates.title' },
  { id: 'manual-files', title: 'help.files.title' },
  { id: 'manual-ics', title: 'help.ics.title' },
  { id: 'manual-keys', title: 'help.keyboard.title' },
  { id: 'manual-a11y', title: 'help.a11y.title' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

/** A label that names another section and links to it. */
export function sectionLink(id: SectionId): { key: string; href: string } {
  const section = SECTIONS.find((s) => s.id === id)!;
  return { key: section.title, href: '#' + id };
}

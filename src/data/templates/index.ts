import type { Locale } from '../../i18n';
import { validateTemplate, type Template } from '../../core/template';
import scrumDe from './scrum.de.json';
import scrumEn from './scrum.en.json';
import kanbanDe from './kanban.de.json';
import kanbanEn from './kanban.en.json';
import safeDe from './safe.de.json';
import safeEn from './safe.en.json';

function load(id: string, json: unknown): Template {
  const result = validateTemplate(json);
  if (!result.ok) throw new Error(`invalid template ${id}`);
  return result.value;
}

export type BuiltinTemplateId = 'scrum' | 'kanban' | 'safe';

export const BUILTIN_TEMPLATES: Record<BuiltinTemplateId, Record<Locale, Template>> = {
  scrum: { de: load('scrum.de', scrumDe), en: load('scrum.en', scrumEn) },
  kanban: { de: load('kanban.de', kanbanDe), en: load('kanban.en', kanbanEn) },
  safe: { de: load('safe.de', safeDe), en: load('safe.en', safeEn) },
};

export function builtinTemplate(id: BuiltinTemplateId, locale: Locale): Template {
  return BUILTIN_TEMPLATES[id][locale];
}

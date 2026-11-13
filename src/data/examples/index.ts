import { loadWorkspace } from '../../core/validate';
import type { Workspace } from '../../core/model';
import { randomId } from '../../core/id';
import exampleJson from './example.caldence.json';

/** Category names of the example in other UI languages; English is the file's own. */
const CATEGORY_NAMES: Record<string, Record<string, string>> = {
  de: { 'cat-events': 'Scrum-Events', 'cat-align': 'Abstimmung', 'cat-stake': 'Stakeholder' },
};

/**
 * A fresh copy of the example workspace with a new id (statically imported, validated on use).
 * With a UI language, its category names follow that language.
 */
export function exampleWorkspace(locale?: string): Workspace {
  const result = loadWorkspace(JSON.stringify(exampleJson));
  if (!result.ok) throw new Error('invalid example workspace');
  const names = (locale && CATEGORY_NAMES[locale]) || {};
  const categories = result.value.categories.map((c) => ({ ...c, name: names[c.id] ?? c.name }));
  return { ...result.value, categories, id: randomId() };
}

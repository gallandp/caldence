import { loadWorkspace } from '../../core/validate';
import type { Workspace } from '../../core/model';
import { randomId } from '../../core/id';
import { renameAssumption } from '../../core/edit';
import exampleJson from './example.caldence.json';

/** Category names of the example in other UI languages; English is the file's own. */
const CATEGORY_NAMES: Record<string, Record<string, string>> = {
  de: { 'cat-events': 'Scrum-Events', 'cat-align': 'Abstimmung', 'cat-stake': 'Stakeholder' },
};

/** Assumption names of the example in other UI languages, by team id and English name. */
const ASSUMPTION_NAMES: Record<string, [string, string, string][]> = {
  de: [['team-alpha', 'Number of stakeholders', 'Anzahl Stakeholder']],
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
  let ws: Workspace = { ...result.value, categories, id: randomId() };
  for (const [teamId, from, to] of (locale && ASSUMPTION_NAMES[locale]) || []) {
    const renamed = renameAssumption(ws, teamId, from, to);
    if (renamed.ok) ws = renamed.value;
  }
  return ws;
}

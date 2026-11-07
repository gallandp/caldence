import { loadWorkspace } from '../../core/validate';
import type { Workspace } from '../../core/model';
import { randomId } from '../../core/id';
import exampleJson from './example.caldence.json';

/** A fresh copy of the example workspace with a new id (statically imported, validated on use). */
export function exampleWorkspace(): Workspace {
  const result = loadWorkspace(JSON.stringify(exampleJson));
  if (!result.ok) throw new Error('invalid example workspace');
  return { ...result.value, id: randomId() };
}

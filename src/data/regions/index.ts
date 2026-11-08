import { validateRegion } from '../../core/regionFile';
import type { Region } from '../../core/regions';
import deSnJson from './de-sn.json';

function load(id: string, json: unknown): Region {
  const result = validateRegion(json);
  if (!result.ok) throw new Error(`invalid region ${id}`);
  return result.value;
}

export const REGIONS: Record<string, Region> = {
  'de-sn': load('de-sn', deSnJson),
};

export function regionIds(): string[] {
  return Object.keys(REGIONS);
}

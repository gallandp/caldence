/**
 * Names of the two organisation levels (the upper one groups teams, see `Area`). Organisations
 * call them differently, so a workspace picks a preset or types its own names. The words for
 * each preset live in the i18n catalogues (`level.<preset>.*`).
 */
export const LEVEL_PRESETS = ['area', 'department', 'platform', 'chapter', 'train'] as const;
export type LevelPreset = (typeof LEVEL_PRESETS)[number];

/** A preset, or own names for both levels (then `preset` is absent). */
export type LevelNames = { preset: LevelPreset } | { area: string; team: string };

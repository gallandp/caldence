import { describe, expect, it } from 'vitest';
import { evaluate, inRange } from '../../scripts/audit.mjs';

const advisory = (name: string, id: string, severity: string, range = '<=4.0.7') => ({
  name,
  title: 't',
  url: `https://github.com/advisories/${id}`,
  severity,
  range,
});
const report = (...via: ReturnType<typeof advisory>[]) => ({
  vulnerabilities: {
    a: { via },
    b: { via: ['a'] },
  },
});
const accepted = { 'GHSA-x': 'picomatch' };

describe('inRange', () => {
  it('handles <= and <', () => {
    expect(inRange('4.0.7', '<=4.0.7')).toBe(true);
    expect(inRange('4.0.8', '<=4.0.7')).toBe(false);
    expect(inRange('4.0.7', '<4.0.7')).toBe(false);
    expect(inRange('3.9.10', '<4.0.0')).toBe(true);
  });
  it('returns null for ranges it does not understand', () => {
    expect(inRange('4.0.7', '>=2.0.0 <4.0.8')).toBeNull();
  });
});

describe('evaluate', () => {
  it('ignores an accepted advisory while no patch exists', () => {
    const r = evaluate(
      report(advisory('picomatch', 'GHSA-x', 'high')),
      { picomatch: '4.0.7' },
      accepted,
    );
    expect(r.failures).toEqual([]);
    expect(r.ignored).toHaveLength(1);
  });
  it('fails on an accepted advisory once a patched version is out', () => {
    const r = evaluate(
      report(advisory('picomatch', 'GHSA-x', 'high')),
      { picomatch: '4.0.8' },
      accepted,
    );
    expect(r.failures[0]).toContain('remove GHSA-x');
  });
  it('fails on an accepted advisory with a range it cannot read', () => {
    const r = evaluate(
      report(advisory('picomatch', 'GHSA-x', 'high', '>=2.0.0 <4.0.8')),
      { picomatch: '4.0.7' },
      accepted,
    );
    expect(r.failures).toHaveLength(1);
  });
  it('fails on any other high or critical advisory', () => {
    const r = evaluate(
      report(advisory('foo', 'GHSA-y', 'critical'), advisory('picomatch', 'GHSA-z', 'high')),
      { picomatch: '4.0.7' },
      accepted,
    );
    expect(r.failures).toHaveLength(2);
  });
  it('lets moderate and low advisories through', () => {
    const r = evaluate(report(advisory('foo', 'GHSA-y', 'moderate')), {}, accepted);
    expect(r).toEqual({ failures: [], ignored: [] });
  });
});

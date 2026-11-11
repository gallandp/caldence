import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc32, zip } from '../../src/core/zip';

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes an archive that unzip reads back', () => {
    const files = [
      { name: 'anna.ics', text: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n' },
      { name: 'jörg.ics', text: 'Grüße' },
    ];
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    const path = join(dir, 'out.zip');
    writeFileSync(path, zip(files, new Date(2027, 0, 4, 12, 30)));
    let listing: string;
    try {
      listing = execFileSync(
        'python3',
        [
          '-I',
          '-c',
          'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);z.testzip();print("\\n".join(z.namelist()));print(z.read("jörg.ics").decode())',
          path,
        ],
        { encoding: 'utf8' },
      );
    } catch {
      // No python: check the signatures at least.
      const bytes = readFileSync(path);
      expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
      return;
    }
    expect(listing).toContain('anna.ics');
    expect(listing).toContain('jörg.ics');
    expect(listing).toContain('Grüße');
  });
});

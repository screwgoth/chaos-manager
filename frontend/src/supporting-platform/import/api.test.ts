/**
 * Client-side file pre-check — U2-NFR-U-08. Step 16.
 *
 * This duplicates a server rule ON PURPOSE, and the tests pin the thing that makes the duplication
 * acceptable: the MESSAGE is the same as the server's, so a user never sees two different
 * explanations for the same refusal. The server check remains authoritative.
 */

import { localFileProblem, MAX_BYTES, templateUrl } from './api';

/** A `File` stub with a controllable size — jsdom cannot allocate 6 MB cheaply. */
function fileOf(name: string, size: number): File {
  const file = new File(['x'], name, { type: 'text/csv' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('localFileProblem', () => {
  it('accepts a .csv within the limit', () => {
    expect(localFileProblem(fileOf('roster.csv', 1024))).toBeNull();
  });

  it('accepts .CSV regardless of case', () => {
    expect(localFileProblem(fileOf('ROSTER.CSV', 1024))).toBeNull();
  });

  /**
   * FR-I-01 is only PARTIALLY satisfied (Q7:A defers Excel), so the message must tell the user what
   * to DO. "Unsupported file type" would leave them stuck with the file they have.
   */
  it('gives Excel users the save-as instruction, not a bare rejection', () => {
    const problem = localFileProblem(fileOf('roster.xlsx', 1024));
    expect(problem).toMatch(/save as/i);
    expect(problem).toMatch(/\.csv/i);
  });

  it('handles legacy .xls the same way', () => {
    expect(localFileProblem(fileOf('roster.xls', 1024))).toMatch(/save as/i);
  });

  it('names the offending file for any other extension', () => {
    expect(localFileProblem(fileOf('notes.txt', 1024))).toContain('notes.txt');
  });

  it('refuses an oversized file and states BOTH the actual size and the limit', () => {
    const problem = localFileProblem(fileOf('big.csv', MAX_BYTES + 1_048_576));
    // Naming only the limit leaves the user guessing how far over they are.
    expect(problem).toContain('6.0 MB');
    expect(problem).toContain('5 MB');
  });

  it('accepts a file exactly at the limit', () => {
    expect(localFileProblem(fileOf('exact.csv', MAX_BYTES))).toBeNull();
  });
});

describe('templateUrl', () => {
  it('maps each kind to its endpoint', () => {
    expect(templateUrl('MEMBER')).toBe('/api/imports/template/members');
    expect(templateUrl('PROJECT')).toBe('/api/imports/template/projects');
  });
});

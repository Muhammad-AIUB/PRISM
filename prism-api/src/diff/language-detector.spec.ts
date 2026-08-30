import { detectLanguages } from './language-detector';

const diffFor = (...paths: string[]): string =>
  paths.map((path) => `diff --git a/${path} b/${path}\n@@ -1 +1 @@\n-a\n+b`).join('\n');

describe('detectLanguages', () => {
  it('maps every extension Laravel recognises', () => {
    expect(detectLanguages(diffFor('a.php'))).toEqual(['PHP']);
    expect(detectLanguages(diffFor('a.py'))).toEqual(['Python']);
    expect(detectLanguages(diffFor('a.go'))).toEqual(['Go']);
    expect(detectLanguages(diffFor('a.rb'))).toEqual(['Ruby']);
    expect(detectLanguages(diffFor('a.java'))).toEqual(['Java']);
  });

  it.each(['js', 'jsx', 'mjs', 'cjs'])('treats .%s as JavaScript', (extension) => {
    expect(detectLanguages(diffFor(`a.${extension}`))).toEqual(['JavaScript']);
  });

  it.each(['ts', 'tsx'])('treats .%s as TypeScript', (extension) => {
    expect(detectLanguages(diffFor(`a.${extension}`))).toEqual(['TypeScript']);
  });

  it('deduplicates while keeping first-seen order', () => {
    expect(detectLanguages(diffFor('b.ts', 'a.php', 'c.tsx', 'd.php'))).toEqual([
      'TypeScript',
      'PHP',
    ]);
  });

  it('is case-insensitive on the extension', () => {
    expect(detectLanguages(diffFor('A.PHP'))).toEqual(['PHP']);
  });

  it('ignores unknown extensions and extensionless files', () => {
    expect(detectLanguages(diffFor('Makefile', 'README.md', 'a.rs'))).toEqual([]);
  });

  it('does not mistake a dot in a directory name for an extension', () => {
    expect(detectLanguages(diffFor('src/v1.2/Makefile'))).toEqual([]);
  });

  it('returns an empty list for a diff with no file headers', () => {
    expect(detectLanguages('just some text')).toEqual([]);
  });

  it('only matches headers at the start of a line', () => {
    expect(detectLanguages('+ diff --git a/a.php b/a.php')).toEqual([]);
  });
});

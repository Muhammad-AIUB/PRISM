import { buildHunkIndex } from './hunk-index';
import { detectLanguages } from './language-detector';
import { markerPath, parseGitHeader, unquotePath } from './git-paths';
import { selectForReview } from './file-selection';

describe('parseGitHeader', () => {
  it('reads a plain path', () => {
    expect(parseGitHeader('diff --git a/src/app.ts b/src/app.ts')).toEqual({
      oldPath: 'src/app.ts',
      newPath: 'src/app.ts',
    });
  });

  it('reads a path with spaces, which git leaves unquoted', () => {
    expect(parseGitHeader('diff --git a/src/my file.py b/src/my file.py')).toEqual({
      oldPath: 'src/my file.py',
      newPath: 'src/my file.py',
    });
  });

  it('keeps a directory literally named "b" intact', () => {
    expect(parseGitHeader('diff --git a/x b/y.ts b/x b/y.ts')?.oldPath).toBe('x b/y.ts');
  });

  it('decodes quoted octal UTF-8 on both sides', () => {
    expect(parseGitHeader('diff --git "a/caf\\303\\251.ts" "b/caf\\303\\251.ts"')).toEqual({
      oldPath: 'café.ts',
      newPath: 'café.ts',
    });
  });

  it('reads a rename, including one where only the new side is quoted', () => {
    expect(parseGitHeader('diff --git a/old.ts b/new.ts')).toEqual({ oldPath: 'old.ts', newPath: 'new.ts' });
    expect(parseGitHeader('diff --git a/old.ts "b/n\\303\\251w.ts"')).toEqual({
      oldPath: 'old.ts',
      newPath: 'néw.ts',
    });
  });

  it('returns null for anything that is not a header', () => {
    expect(parseGitHeader('+diff --git a/x b/x')).toBeNull();
    expect(parseGitHeader('@@ -1 +1 @@')).toBeNull();
  });
});

describe('markerPath and unquotePath', () => {
  it('strips the prefix and the trailing tab git adds for spaced paths', () => {
    expect(markerPath('b/my file.py\t', 'b/')).toBe('my file.py');
  });

  it('returns null for /dev/null', () => {
    expect(markerPath('/dev/null', 'b/')).toBeNull();
  });

  it('decodes simple escapes and leaves unquoted text alone', () => {
    expect(unquotePath('"a/tab\\there"')).toBe('a/tab\there');
    expect(unquotePath('plain/path.ts')).toBe('plain/path.ts');
  });
});

/**
 * The bug these pin: a spaced path failed the old `\S+` header match, so the
 * parser stayed inside the previous file. The spaced file vanished, its
 * `---`/`+++` lines became a removed and an added line, and its code was filed
 * under the previous file's name - which is how the model was shown it.
 */
describe('a spaced path no longer bleeds into the previous file', () => {
  const diff = [
    'diff --git a/src/first.ts b/src/first.ts',
    '--- a/src/first.ts',
    '+++ b/src/first.ts',
    '@@ -1,1 +1,1 @@',
    '+const first = 1;',
    'diff --git a/src/my file.py b/src/my file.py',
    '--- a/src/my file.py\t',
    '+++ b/src/my file.py\t',
    '@@ -1,1 +1,1 @@',
    '+password = "hunter2"',
  ].join('\n');

  it('indexes each file under its own name, with only its own lines', () => {
    const index = buildHunkIndex(diff);

    expect([...index.keys()]).toEqual(['src/first.ts', 'src/my file.py']);
    expect(index.get('src/first.ts')?.lines.map((l) => l.text)).toEqual(['const first = 1;']);
    expect(index.get('src/my file.py')?.lines.map((l) => l.text)).toEqual(['password = "hunter2"']);
  });

  it('detects the spaced file\'s language, so its review rules apply', () => {
    expect(detectLanguages(diff)).toEqual(['TypeScript', 'Python']);
  });

  it('selects the spaced file for review under its real path', () => {
    const selection = selectForReview(diff, 100_000);

    // The old header match recorded this file as "src/my".
    expect(selection.files).toEqual(['src/first.ts', 'src/my file.py']);
  });
});

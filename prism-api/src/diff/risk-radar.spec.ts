import { assessRisk, MAX_CHECKS, parseChangedFiles } from './risk-radar';

/** Builds one file's section of a unified diff. */
function file(
  path: string,
  added: string[],
  removed: string[] = [],
  mode: 'new' | 'deleted' | null = null,
): string {
  const header = [`diff --git a/${path} b/${path}`];

  if (mode === 'new') {
    header.push('new file mode 100644');
  } else if (mode === 'deleted') {
    header.push('deleted file mode 100644');
  }

  header.push(
    'index 1111111..2222222 100644',
    `--- ${mode === 'new' ? '/dev/null' : `a/${path}`}`,
    `+++ ${mode === 'deleted' ? '/dev/null' : `b/${path}`}`,
    `@@ -1,${removed.length} +1,${added.length} @@`,
  );

  return [...header, ...removed.map((l) => `-${l}`), ...added.map((l) => `+${l}`)].join('\n');
}

const lines = (count: number, text = 'const x = 1;') => Array.from({ length: count }, () => text);

describe('parseChangedFiles', () => {
  it('counts additions and deletions inside hunks only, not the ---/+++ headers', () => {
    const [changed] = parseChangedFiles(file('src/a.ts', ['one', 'two'], ['old']));

    expect(changed).toMatchObject({ path: 'src/a.ts', additions: 2, deletions: 1, status: 'modified' });
  });

  it('records created, deleted and renamed files', () => {
    const renamed = [
      'diff --git a/old.ts b/new.ts',
      'similarity index 90%',
      'rename from old.ts',
      'rename to new.ts',
    ].join('\n');
    const files = parseChangedFiles(
      [file('a.ts', ['x'], [], 'new'), file('b.ts', [], ['y'], 'deleted'), renamed].join('\n'),
    );

    expect(files.map((f) => [f.path, f.status])).toEqual([
      ['a.ts', 'added'],
      ['b.ts', 'deleted'],
      ['new.ts', 'renamed'],
    ]);
  });
});

describe('parseChangedFiles: paths git has to escape', () => {
  const section = (header: string, minus: string, plus: string, added: string) =>
    [header, 'index 1..2 100644', minus, plus, '@@ -0,0 +1 @@', `+${added}`].join('\n');

  it('reads a path with spaces, which git leaves unquoted but tab-terminates', () => {
    const [f] = parseChangedFiles(
      section('diff --git a/src/auth/my login.ts b/src/auth/my login.ts', '--- a/src/auth/my login.ts\t', '+++ b/src/auth/my login.ts\t', 'x'),
    );

    expect(f?.path).toBe('src/auth/my login.ts');
  });

  it('decodes a quoted path with octal UTF-8 escapes', () => {
    const [f] = parseChangedFiles(
      section('diff --git "a/src/caf\\303\\251.ts" "b/src/caf\\303\\251.ts"', '--- "a/src/caf\\303\\251.ts"', '+++ "b/src/caf\\303\\251.ts"', 'x'),
    );

    expect(f?.path).toBe('src/café.ts');
  });

  it('takes the new side of a rename, and keeps the old path for a deletion', () => {
    const files = parseChangedFiles(
      [
        'diff --git a/old name.ts b/new name.ts',
        'similarity index 90%',
        'rename from old name.ts',
        'rename to new name.ts',
        'diff --git a/gone.ts b/gone.ts',
        'deleted file mode 100644',
        '--- a/gone.ts',
        '+++ /dev/null',
        '@@ -1 +0,0 @@',
        '-x',
      ].join('\n'),
    );

    expect(files.map((f) => f.path)).toEqual(['new name.ts', 'gone.ts']);
  });

  it('still classifies a spaced path, so it cannot hide from the radar', () => {
    const risk = assessRisk(
      section('diff --git a/src/auth/my guard.ts b/src/auth/my guard.ts', '--- a/src/auth/my guard.ts\t', '+++ b/src/auth/my guard.ts\t', 'x'),
    );

    expect(risk.signals.map((s) => s.id)).toContain('auth');
  });
});

describe('assessRisk', () => {
  it('rates a small, tested change as low risk with nothing to ask', () => {
    const risk = assessRisk(
      [file('src/format.ts', lines(5)), file('src/format.spec.ts', lines(5))].join('\n'),
    );

    expect(risk.level).toBe('low');
    expect(risk.score).toBe(0);
    expect(risk.signals).toEqual([]);
    expect(risk.checklist).toEqual([]);
    expect(risk.stats).toEqual({ files: 2, additions: 10, deletions: 0, sourceFiles: 1, testFiles: 1 });
  });

  it('returns a low, empty assessment for an empty diff rather than throwing', () => {
    expect(assessRisk('')).toMatchObject({ level: 'low', score: 0, signals: [], checklist: [] });
  });

  it('flags behaviour that changed with no test alongside it', () => {
    const risk = assessRisk(file('src/billing.ts', lines(30)));

    expect(risk.signals.map((s) => s.id)).toContain('untested');
  });

  it('flags even a tiny untested change when it is in auth code', () => {
    const risk = assessRisk(file('src/auth/admin.guard.ts', [], ['if (!user.isAdmin) throw new ForbiddenException();']));

    expect(risk.signals.map((s) => s.id)).toEqual(expect.arrayContaining(['auth', 'untested']));
    expect(assessRisk(file('src/util.ts', lines(3))).signals).toEqual([]);
  });

  it('does not count docs or lockfiles as reviewable size', () => {
    const risk = assessRisk(
      [file('package-lock.json', lines(5000)), file('docs/guide.md', lines(900))].join('\n'),
    );

    expect(risk.signals.map((s) => s.id)).not.toContain('size');
    expect(risk.signals.map((s) => s.id)).not.toContain('untested');
  });

  it('asks to split a change past 400 source lines', () => {
    const risk = assessRisk(
      [file('src/big.ts', lines(450)), file('src/big.spec.ts', lines(10))].join('\n'),
    );

    expect(risk.signals[0]).toMatchObject({ id: 'size', weight: 20 });
    expect(risk.checklist.map((c) => c.id)).toContain('split');
  });

  it('treats an auth guard change as sensitive, but not a file that merely starts with "auth"', () => {
    const guard = assessRisk(file('src/auth/web-auth.guard.ts', lines(3)));
    const authors = assessRisk(file('src/authors.ts', lines(3)));

    expect(guard.signals.map((s) => s.id)).toContain('auth');
    expect(guard.checklist[0]?.id).toBe('auth');
    expect(authors.signals.map((s) => s.id)).not.toContain('auth');
  });

  it('asks for a rollback when a new migration has no way back', () => {
    const risk = assessRisk(
      file('db/migrations/20260901_add_col.sql', ['ALTER TABLE users ADD COLUMN plan text;'], [], 'new'),
    );
    const check = risk.checklist.find((c) => c.id === 'migration');

    expect(check?.question).toMatch(/no visible way back/);
  });

  it('asks the expand/contract question instead when a rollback is present', () => {
    const risk = assessRisk(
      file(
        'migrations/0002.py',
        ['def upgrade(): op.add_column("t", "c")', 'def downgrade(): op.drop_column("t", "c")'],
        [],
        'new',
      ),
    );

    expect(risk.checklist.find((c) => c.id === 'migration')?.question).toMatch(/expand, then contract/);
  });

  it('puts a hardcoded credential at high risk on its own and asks for rotation first', () => {
    // Assembled at runtime: a literal in this shape trips GitHub's push
    // protection, which is the same instinct this test is checking for.
    const fakeKey = ['sk', 'live', 'abcdefghijklmnopqrstuvwx'].join('_');
    const risk = assessRisk(
      [
        file('src/client.ts', [`const apiKey = "${fakeKey}";`]),
        file('src/client.spec.ts', lines(1)),
      ].join('\n'),
    );

    expect(risk.level).toBe('high');
    expect(risk.signals[0]?.id).toBe('secret');
    expect(risk.checklist[0]?.id).toBe('secret');
  });

  it('does not mistake reading a secret from the environment for hardcoding one', () => {
    const risk = assessRisk(file('src/client.ts', ['const apiKey = process.env.API_KEY ?? "";']));

    expect(risk.signals.map((s) => s.id)).not.toContain('secret');
  });

  it('ignores credential-looking literals in tests, which are fixtures', () => {
    const risk = assessRisk(file('test/auth.spec.ts', ['const password = "correct-horse-battery";']));

    expect(risk.signals.map((s) => s.id)).not.toContain('secret');
  });

  it('asks about timeouts for a new network call with none in sight', () => {
    const risk = assessRisk(file('src/weather.ts', ['const r = await fetch(url);']));

    expect(risk.checklist.map((c) => c.id)).toContain('timeouts');
  });

  it('stays quiet about timeouts when the same file sets one', () => {
    const risk = assessRisk(
      file('src/weather.ts', [
        'const r = await fetch(url, {',
        '  signal: AbortSignal.timeout(5000),',
        '});',
      ]),
    );

    expect(risk.checklist.map((c) => c.id)).not.toContain('timeouts');
  });

  it('judges each call on its own: a covered fetch does not vouch for an uncovered one', () => {
    const risk = assessRisk(
      file('src/weather.ts', [
        'const a = await fetch(one, { signal: AbortSignal.timeout(5000) });',
        ...lines(10, '// unrelated work'),
        'const b = await fetch(two);',
      ]),
    );

    expect(risk.checklist.map((c) => c.id)).toContain('timeouts');
  });

  it('reads JVM test names by convention, without mistaking words that merely end in "test"', () => {
    const tested = (path: string) =>
      assessRisk([file('src/app/Service.ts', lines(25)), file(path, lines(2))].join('\n')).stats.testFiles;

    for (const real of ['src/FooTest.java', 'src/FooTests.cs', 'src/TestUtils.kt']) {
      expect(tested(real)).toBe(1);
    }

    for (const notATest of ['src/Latest.java', 'src/Contest.cs', 'src/Manifest.kt']) {
      expect(tested(notATest)).toBe(0);
    }
  });

  it('still says "no tests changed" when the only near-miss is Latest.java', () => {
    const risk = assessRisk(file('src/app/Latest.java', lines(30)));

    expect(risk.signals.map((s) => s.id)).toContain('untested');
  });

  it('does not read RegExp#exec as a subprocess call', () => {
    const risk = assessRisk(file('src/parse.ts', ['const m = HEADER.exec(line);', 'const q = Model.find().exec();']));

    expect(risk.checklist.map((c) => c.id)).not.toContain('timeouts');
  });

  it('still reads real subprocess calls, bare or through the module', () => {
    for (const line of ['await exec("git status");', 'execSync("ls");', 'cp.execFile("x");', 'child_process.exec("x");']) {
      expect(assessRisk(file('src/run.ts', [line])).checklist.map((c) => c.id)).toContain('timeouts');
    }
  });

  describe('questions come from code, not from words in comments or strings', () => {
    const checks = (added: string[]) =>
      assessRisk(file('src/thing.ts', added)).checklist.map((c) => c.id);

    // Each of these fired on this repository's own history before the fix.
    it('ignores "retry" in an error message and in a comment', () => {
      expect(
        checks([
          'export const EMPTY = "AI review failed. Click Re-analyze to retry.";',
          '// A Redis outage costs a retry rather than a false success.',
        ]),
      ).not.toContain('retries');
    });

    it('ignores "Kafka" in a string and in a doc comment', () => {
      expect(
        checks([" * it lists Kubernetes, Kafka and a service mesh", "technology: 'Managed Kafka or pub/sub',"]),
      ).not.toContain('messaging');
    });

    it('ignores fetch() mentioned in a comment', () => {
      expect(checks(['// we used to call fetch(url) here'])).not.toContain('timeouts');
    });

    it('does not accept a timeout that exists only in a comment as evidence', () => {
      expect(checks(['const r = await fetch(url); // timeout handled upstream'])).toContain('timeouts');
    });

    it('still asks about real code on the same lines as comments and strings', () => {
      const ids = checks([
        'await retry(send, { attempts: 3 }); // with backoff',
        'await queue.add("email", payload);',
        'const u = "http://api.example.com/x"; await fetch(u);',
      ]);

      expect(ids).toEqual(expect.arrayContaining(['retries', 'messaging', 'timeouts']));
    });

    it('still finds SQL and secrets, which live inside strings', () => {
      const ids = checks([
        'db.query("SELECT * FROM users WHERE id = " + id);',
        'const apiKey = "abcdefghijklmnop1234567";',
      ]);

      expect(ids).toEqual(expect.arrayContaining(['raw_sql', 'secret']));
    });
  });

  it('does not treat a fetch() inside a test as a production dependency', () => {
    const risk = assessRisk(file('src/weather.spec.ts', ['await fetch(url);']));

    expect(risk.checklist).toEqual([]);
  });

  it('spots string-built SQL, swallowed errors and at-least-once delivery', () => {
    const risk = assessRisk(
      file('src/orders.ts', [
        'db.query(`SELECT * FROM orders WHERE id = ${id}`);',
        'try { charge(); } catch (e) {}',
        'await queue.add("email", payload);',
      ]),
    );
    const ids = risk.checklist.map((c) => c.id);

    expect(ids).toEqual(expect.arrayContaining(['raw_sql', 'error_swallowed', 'messaging']));
  });

  it('does not read Set#add as enqueueing a job', () => {
    const risk = assessRisk(file('src/seen.ts', ['seen.add(id);']));

    expect(risk.checklist.map((c) => c.id)).not.toContain('messaging');
  });

  it('asks about the lockfile when only the manifest changed', () => {
    const manifestOnly = assessRisk(file('package.json', ['"left-pad": "^1.3.0",']));
    const both = assessRisk(
      [file('package.json', ['"left-pad": "^1.3.0",']), file('package-lock.json', lines(3))].join('\n'),
    );

    expect(manifestOnly.checklist.map((c) => c.id)).toContain('lockfile');
    expect(both.checklist.map((c) => c.id)).not.toContain('lockfile');
  });

  it('flags removed tests', () => {
    const risk = assessRisk(file('src/pay.spec.ts', [], lines(12), 'deleted'));

    expect(risk.signals.map((s) => s.id)).toContain('tests_removed');
  });

  it('recognises CI and deploy configuration', () => {
    const risk = assessRisk(file('.github/workflows/deploy.yml', ['on: push']));

    expect(risk.signals.map((s) => s.id)).toContain('infra');
    expect(risk.checklist.map((c) => c.id)).toContain('infra');
  });

  it('caps the checklist, keeping what cannot be undone ahead of what only slows review', () => {
    const risk = assessRisk(
      [
        file('src/auth/login.controller.ts', [
          'const secret = "abcdefghijklmnop1234";',
          'await fetch(url);',
          'db.query("SELECT * FROM u WHERE id = " + id);',
          'catch (e) {}',
          'await retry(fn);',
          'redis.get(k);',
          'setInterval(tick, 1000);',
          'publish(evt);',
        ]),
        file('db/migrations/1.sql', ['ALTER TABLE t ADD c int;'], [], 'new'),
        file('package.json', ['"x": "1"']),
      ].join('\n'),
    );

    expect(risk.checklist).toHaveLength(MAX_CHECKS);
    expect(risk.checklist.slice(0, 3).map((c) => c.id)).toEqual(['secret', 'auth', 'migration']);
    expect(risk.score).toBeLessThanOrEqual(100);
    expect(risk.level).toBe('high');
  });

  it('lists signals heaviest first and caps the files named on each', () => {
    const many = Array.from({ length: 8 }, (_, i) => file(`src/auth/g${i}.guard.ts`, lines(1)));
    const risk = assessRisk([...many, file('src/auth/g.spec.ts', lines(1))].join('\n'));
    const auth = risk.signals.find((s) => s.id === 'auth');

    expect(auth?.files).toHaveLength(5);

    const weights = risk.signals.map((s) => s.weight);

    expect(weights).toEqual([...weights].sort((a, b) => b - a));
  });
});

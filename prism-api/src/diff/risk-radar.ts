/**
 * Risk Radar: how dangerous is this change to merge, and what should the
 * reviewer ask before they do?
 *
 * The AI pass answers "what is wrong with these lines". This answers a
 * different question, one a senior reviewer settles in the first ten seconds
 * of opening a pull request: how much could this break, and where? A
 * forty-line change to a login guard deserves more attention than a
 * nine-hundred-line docs rewrite, and the score the model produces cannot say
 * that — it reads the lines, not their blast radius.
 *
 * Deliberately deterministic. No model call, no network, no database: the
 * same diff always yields the same assessment, so it can be unit-tested, it
 * costs nothing to run on every push, and it still works on the day Groq is
 * down. That last property matters most, because it means a review whose AI
 * pass degraded still carries a useful signal.
 *
 * The output is advisory by construction. Signals explain the level ("touches
 * authentication", "no tests changed") and every checklist item is a question
 * rather than a finding, because a path name is evidence of where to look,
 * not proof that anything is wrong.
 */

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskSignal {
  id: RiskSignalId;
  label: string;
  /** Contribution to the score. Signals are listed heaviest first. */
  weight: number;
  detail: string;
  /** At most MAX_FILES_PER_ITEM, so a sweeping change stays readable. */
  files: string[];
}

export interface ReliabilityCheck {
  id: ReliabilityCheckId;
  question: string;
  why: string;
  files: string[];
}

export interface RiskStats {
  files: number;
  additions: number;
  deletions: number;
  sourceFiles: number;
  testFiles: number;
}

export interface RiskAssessment {
  level: RiskLevel;
  /** 0-100. Higher is riskier. */
  score: number;
  stats: RiskStats;
  signals: RiskSignal[];
  checklist: ReliabilityCheck[];
}

export type RiskSignalId =
  | 'size'
  | 'spread'
  | 'auth'
  | 'migration'
  | 'secret'
  | 'untested'
  | 'tests_removed'
  | 'infra'
  | 'dependencies'
  | 'public_api'
  | 'config';

export type ReliabilityCheckId =
  | 'secret'
  | 'auth'
  | 'migration'
  | 'timeouts'
  | 'raw_sql'
  | 'error_swallowed'
  | 'retries'
  | 'messaging'
  | 'public_api'
  | 'concurrency'
  | 'caching'
  | 'lockfile'
  | 'infra'
  | 'split';

/**
 * The order a reviewer should work through them when there are more than
 * MAX_CHECKS: what cannot be undone first, what merely slows a review last.
 */
const CHECK_PRIORITY: readonly ReliabilityCheckId[] = [
  'secret',
  'auth',
  'migration',
  'raw_sql',
  'public_api',
  'timeouts',
  'error_swallowed',
  'messaging',
  'retries',
  'infra',
  'concurrency',
  'caching',
  'lockfile',
  'split',
];

/** Past this a checklist stops being read. Same reasoning as the comment's cap of three. */
export const MAX_CHECKS = 6;
const MAX_FILES_PER_ITEM = 5;

export const HIGH_THRESHOLD = 50;
export const MEDIUM_THRESHOLD = 25;

// ── Diff parsing ────────────────────────────────────────────────────

interface ChangedFile {
  path: string;
  status: 'added' | 'deleted' | 'modified' | 'renamed';
  additions: number;
  deletions: number;
  addedLines: string[];
}

const FILE_HEADER = /^diff --git a\/(\S+) b\/(\S+)/;

/**
 * A narrower parser than hunk-index.ts on purpose. That one answers "is this
 * line real?" and keys files by their old path; this needs the new path and
 * the file's status (created, deleted, renamed), which the hunk index drops
 * as metadata.
 */
export function parseChangedFiles(diff: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  let current: ChangedFile | undefined;
  let inHunk = false;

  for (const line of diff.split('\n')) {
    const header = FILE_HEADER.exec(line);

    if (header) {
      current = {
        path: header[2] as string,
        status: 'modified',
        additions: 0,
        deletions: 0,
        addedLines: [],
      };
      files.push(current);
      inHunk = false;
      continue;
    }

    if (!current) {
      continue;
    }

    if (!inHunk) {
      if (line.startsWith('new file mode')) {
        current.status = 'added';
      } else if (line.startsWith('deleted file mode')) {
        current.status = 'deleted';
      } else if (line.startsWith('rename from')) {
        current.status = 'renamed';
      }
    }

    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }

    // `--- a/x` and `+++ b/x` sit before the first hunk and would otherwise
    // count as a deletion and an addition.
    if (!inHunk) {
      continue;
    }

    if (line.startsWith('+')) {
      current.additions += 1;
      current.addedLines.push(line.slice(1));
    } else if (line.startsWith('-')) {
      current.deletions += 1;
    }
  }

  return files;
}

// ── Path classification ─────────────────────────────────────────────

const TEST_PATH =
  /(^|\/)(__tests__|__mocks__|tests?|spec|specs|e2e|fixtures)\/|\.(test|spec)\.[a-z]+$|_test\.(go|py|rb)$|(^|\/)test_[^/]+\.py$|_spec\.rb$|Tests?\.(java|cs|kt)$/i;

const DOC_PATH = /\.(md|mdx|rst|txt|adoc)$|(^|\/)docs?\//i;

const LOCKFILE =
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|Gemfile\.lock|poetry\.lock|Pipfile\.lock|go\.sum|Cargo\.lock|uv\.lock|bun\.lockb?)$/;

const MANIFEST =
  /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|Pipfile|go\.mod|Gemfile|composer\.json|pom\.xml|build\.gradle(\.kts)?|Cargo\.toml)$/;

const AUTH_PATH =
  /(^|[/_.-])(auth|authn|authz|authenticat\w*|authori[sz]\w*|login|logout|sessions?|oauth\d?|sso|saml|jwt|permissions?|polic(y|ies)|acl|rbac|guards?|passwords?|crypt|crypto|tokens?)([/_.-]|$)/i;

const MIGRATION_PATH =
  /(^|\/)(migrations?|migrate|alembic|flyway|liquibase)\/|(^|\/)schema\.(sql|prisma|rb)$|\.sql$/i;

const INFRA_PATH =
  /(^|\/)(Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|compose\.ya?ml|Procfile|render\.yaml|vercel\.json|netlify\.toml|fly\.toml|app\.yaml|nginx[^/]*\.conf|Jenkinsfile|\.gitlab-ci\.yml)$|(^|\/)(\.github\/workflows|\.circleci|terraform|k8s|kubernetes|helm|charts|deploy|infra|ops)\/|\.tf$/i;

const PUBLIC_API_PATH =
  /(^|\/)(routes?|controllers?|api|handlers?|endpoints?|graphql)\/|\.(controller|routes?|resolver)\.[a-z]+$|\.(proto|graphql|gql)$|(^|\/)(openapi|swagger)[^/]*\.(ya?ml|json)$/i;

const CONFIG_PATH =
  /(^|\/)\.env(\.[\w-]+)?$|(^|\/)(config|configs|settings)\/|(^|\/)(settings\.py|application\.(ya?ml|properties)|appsettings[^/]*\.json)$/i;

// ── Added-line patterns ─────────────────────────────────────────────

const NETWORK_CALL =
  /\bfetch\(|\baxios(\.\w+)?\(|\bhttps?\.(get|request)\(|\brequests\.(get|post|put|patch|delete|request)\(|\bhttpx\.|\burllib|\bHttpClient\b|\bgot\(|\bhttp\.(Get|Post|NewRequest)|\bnew\s+Pool\(|\bcreateConnection\(|\bsubprocess\.|\bexec(File|Sync)?\(|\bspawn\(/;

const TIMEOUT_EVIDENCE = /timeout|AbortSignal|AbortController|signal\s*[:=]|WithTimeout|WithDeadline|deadline/i;

const RAW_SQL =
  /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[^;]*?(['"`]\s*\+\s*\w|\$\{|%s|\{\w+\}|"\s*\.\s*\$)/i;

const SWALLOWED_ERROR =
  /catch\s*(\([^)]*\))?\s*\{\s*\}|except(\s+\w+(\s+as\s+\w+)?)?\s*:\s*pass\b|\brescue\s*(=>\s*\w+)?\s*;?\s*nil\b|_\s*=\s*err\b|\.catch\(\s*\(\)\s*=>\s*(\{\s*\}|undefined|null)\s*\)/;

const RETRY = /\bretr(y|ies|ying)\b|\bbackoff\b|\battempts?\b\s*[<>=]/i;

const MESSAGING =
  /\b(enqueue|publish|sendMessage|addJob|addBulk)\s*\(|\bqueue\.add\(|\b(kafka|rabbitmq|amqp|sqs|sns|pubsub|nats|bullmq|celery|sidekiq)\b/i;

const CONCURRENCY =
  /\bsetInterval\(|\bgo\s+func\b|\bgo\s+\w+\(|\bnew\s+Thread\(|\bThreadPoolExecutor\b|\basyncio\.(gather|create_task)\b|\bPromise\.all\(|\bMutex\b|\bsync\.WaitGroup\b|\bWorker\(/;

const CACHING = /\b(redis|memcache[d]?|lru[-_]?cache|cache\.(get|set|put|remember)|@Cacheable|setex)\b/i;

/**
 * An assignment of a long literal to something named like a credential.
 * Deliberately excludes `process.env`, `os.environ`, `getenv` and friends:
 * reading a secret from the environment is the fix, not the problem.
 */
const HARDCODED_SECRET =
  /\b(api[_-]?key|secret|passw(or)?d|private[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\w*["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i;

const PRIVATE_KEY_BLOCK = /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/;

const KNOWN_TOKEN_SHAPE =
  /\b(AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|gh[ousr]_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]{10,}|sk_live_[A-Za-z0-9]{16,}|gsk_[A-Za-z0-9]{20,})\b/;

const ROLLBACK_EVIDENCE = /\bdown(grade)?\b|rollback|revert|reversible|DROP\s+/i;

// ── Assessment ──────────────────────────────────────────────────────

function cap(paths: string[]): string[] {
  return [...new Set(paths)].slice(0, MAX_FILES_PER_ITEM);
}

function levelFor(score: number): RiskLevel {
  if (score >= HIGH_THRESHOLD) {
    return 'high';
  }

  return score >= MEDIUM_THRESHOLD ? 'medium' : 'low';
}

function sizeWeight(changedLines: number): number {
  if (changedLines >= 1000) {
    return 30;
  }

  if (changedLines >= 400) {
    return 20;
  }

  return changedLines >= 150 ? 10 : 0;
}

export function assessRisk(diff: string): RiskAssessment {
  const files = parseChangedFiles(diff);

  const isTest = (f: ChangedFile) => TEST_PATH.test(f.path);
  const isDoc = (f: ChangedFile) => DOC_PATH.test(f.path);
  const isLock = (f: ChangedFile) => LOCKFILE.test(f.path);

  const tests = files.filter(isTest);
  const source = files.filter((f) => !isTest(f) && !isDoc(f) && !isLock(f));

  const stats: RiskStats = {
    files: files.length,
    additions: files.reduce((sum, f) => sum + f.additions, 0),
    deletions: files.reduce((sum, f) => sum + f.deletions, 0),
    sourceFiles: source.length,
    testFiles: tests.length,
  };

  const signals: RiskSignal[] = [];
  const checks = new Map<ReliabilityCheckId, ReliabilityCheck>();

  const addCheck = (id: ReliabilityCheckId, question: string, why: string, paths: string[]) => {
    if (!checks.has(id)) {
      checks.set(id, { id, question, why, files: cap(paths) });
    }
  };

  /** Files among `pool` with at least one added line matching `pattern`. */
  const addedMatching = (pool: ChangedFile[], pattern: RegExp) =>
    pool.filter((f) => f.addedLines.some((line) => pattern.test(line))).map((f) => f.path);

  // Lockfiles and docs are excluded: a 4,000-line package-lock.json is not a
  // 4,000-line change anyone reads.
  const sourceLines = source.reduce((sum, f) => sum + f.additions + f.deletions, 0);

  // Size
  const size = sizeWeight(sourceLines);

  if (size > 0) {
    signals.push({
      id: 'size',
      label: 'Large change',
      weight: size,
      detail: `${sourceLines} changed lines outside tests, docs and lockfiles. Review quality falls off sharply past about 400.`,
      files: [],
    });

    if (sourceLines >= 400) {
      addCheck(
        'split',
        'Can this ship in smaller pieces, or behind a feature flag?',
        'A change this size is hard to review and hard to roll back partially.',
        [],
      );
    }
  }

  // Spread
  if (source.length >= 15) {
    signals.push({
      id: 'spread',
      label: 'Wide blast radius',
      weight: source.length >= 30 ? 15 : 10,
      detail: `${source.length} source files touched. A wide change is more likely to break something no single reviewer owns.`,
      files: [],
    });
  }

  // Secrets — the only signal strong enough to reach "high" on its own.
  const secretFiles = files
    .filter((f) => !isTest(f))
    .filter((f) =>
      f.addedLines.some(
        (line) =>
          PRIVATE_KEY_BLOCK.test(line) || KNOWN_TOKEN_SHAPE.test(line) || HARDCODED_SECRET.test(line),
      ),
    )
    .map((f) => f.path);

  if (secretFiles.length > 0) {
    signals.push({
      id: 'secret',
      label: 'Possible hardcoded secret',
      weight: 50,
      detail: 'An added line looks like a credential literal or a known token format.',
      files: cap(secretFiles),
    });
    addCheck(
      'secret',
      'Is that a real credential? If so, rotate it now — it is already in git history.',
      'Removing it in a later commit does not remove it from the repository.',
      secretFiles,
    );
  }

  // Authentication and authorization
  const authFiles = source.filter((f) => AUTH_PATH.test(f.path)).map((f) => f.path);

  if (authFiles.length > 0) {
    signals.push({
      id: 'auth',
      label: 'Touches authentication or authorization',
      weight: 20,
      detail: 'Mistakes here fail open, and nothing looks broken when they do.',
      files: cap(authFiles),
    });
    addCheck(
      'auth',
      'Is any access check removed or loosened, and is there a test for the denied path?',
      'Tests usually cover who gets in. The bug is almost always who else does.',
      authFiles,
    );
  }

  // Migrations
  const migrations = files.filter((f) => MIGRATION_PATH.test(f.path) && !isTest(f));

  if (migrations.length > 0) {
    const noRollback = migrations
      .filter((f) => f.status === 'added' && !f.addedLines.some((l) => ROLLBACK_EVIDENCE.test(l)))
      .map((f) => f.path);

    signals.push({
      id: 'migration',
      label: 'Schema or data migration',
      weight: 20,
      detail: 'Migrations run against production data and are the hardest change to undo.',
      files: cap(migrations.map((f) => f.path)),
    });
    addCheck(
      'migration',
      noRollback.length > 0
        ? 'This migration has no visible way back. What is the rollback, and does the old code still run against the new schema?'
        : 'Does the currently deployed code still run against the new schema (expand, then contract)?',
      'During a deploy, old and new code run at the same time against one database.',
      migrations.map((f) => f.path),
    );
  }

  // Tests
  const removedTests = tests.filter(
    (f) => f.status === 'deleted' || (f.deletions > 0 && f.additions === 0),
  );

  if (removedTests.length > 0) {
    signals.push({
      id: 'tests_removed',
      label: 'Tests removed',
      weight: 15,
      detail: 'Coverage went down. Worth knowing whether that was the intent.',
      files: cap(removedTests.map((f) => f.path)),
    });
  }

  // Twenty lines is where "no test changed" stops being noise — except in
  // auth code, where a two-line change deleting a check is the classic
  // incident and exactly the one nobody writes a test for.
  if (tests.length === 0 && (sourceLines >= 20 || authFiles.length > 0)) {
    signals.push({
      id: 'untested',
      label: 'No tests changed',
      weight: 20,
      detail: 'Behaviour changed and no test changed with it, so nothing proves the new behaviour.',
      files: [],
    });
  }

  // Infrastructure and deploy
  const infraFiles = files.filter((f) => INFRA_PATH.test(f.path)).map((f) => f.path);

  if (infraFiles.length > 0) {
    signals.push({
      id: 'infra',
      label: 'Build, CI or deploy configuration',
      weight: 15,
      detail: 'Breaks here take down every service that shares the pipeline, not one route.',
      files: cap(infraFiles),
    });
    addCheck(
      'infra',
      'Can this be rolled back on its own, and has it run once somewhere that is not production?',
      'Deploy changes are usually verified by deploying, which is too late.',
      infraFiles,
    );
  }

  // Dependencies
  const manifests = files.filter((f) => MANIFEST.test(f.path)).map((f) => f.path);

  if (manifests.length > 0) {
    signals.push({
      id: 'dependencies',
      label: 'Dependencies changed',
      weight: 10,
      detail: 'New code you did not write, with its own transitive tree and licence.',
      files: cap(manifests),
    });

    if (!files.some(isLock)) {
      addCheck(
        'lockfile',
        'A dependency manifest changed but no lockfile did. Is the lockfile up to date?',
        'Without it, CI and production can resolve different versions than you tested.',
        manifests,
      );
    }
  }

  // Public contracts
  const apiFiles = source.filter((f) => PUBLIC_API_PATH.test(f.path)).map((f) => f.path);

  if (apiFiles.length > 0) {
    signals.push({
      id: 'public_api',
      label: 'Public API surface',
      weight: 10,
      detail: 'Routes, handlers or schemas that other clients depend on.',
      files: cap(apiFiles),
    });
    addCheck(
      'public_api',
      'Is this backward compatible for clients already deployed (field names, status codes, error bodies)?',
      'You can redeploy the server in minutes. You cannot redeploy your users.',
      apiFiles,
    );
  }

  // Configuration
  const configFiles = files.filter((f) => CONFIG_PATH.test(f.path)).map((f) => f.path);

  if (configFiles.length > 0) {
    signals.push({
      id: 'config',
      label: 'Runtime configuration',
      weight: 10,
      detail: 'Config changes skip most of the checks code goes through.',
      files: cap(configFiles),
    });
  }

  // Reliability questions from what the added lines actually do. Tests are
  // excluded: a fetch() in a test is a mock, not a production dependency.
  const productionFiles = source;

  const noTimeout = productionFiles
    .filter(
      (f) =>
        f.addedLines.some((l) => NETWORK_CALL.test(l)) &&
        !f.addedLines.some((l) => TIMEOUT_EVIDENCE.test(l)),
    )
    .map((f) => f.path);

  if (noTimeout.length > 0) {
    addCheck(
      'timeouts',
      'Does every new network, database or subprocess call have a timeout?',
      'A dependency that hangs is worse than one that fails: it holds a connection and a worker until something else gives out.',
      noTimeout,
    );
  }

  const rawSql = addedMatching(productionFiles, RAW_SQL);

  if (rawSql.length > 0) {
    addCheck(
      'raw_sql',
      'Is that SQL built from interpolated values? Use bound parameters.',
      'String-built queries are the most common route to SQL injection.',
      rawSql,
    );
  }

  const swallowed = addedMatching(productionFiles, SWALLOWED_ERROR);

  if (swallowed.length > 0) {
    addCheck(
      'error_swallowed',
      'An error is caught and dropped. Should it be logged, rethrown, or surfaced?',
      'A swallowed error turns a failure into a success nobody can see.',
      swallowed,
    );
  }

  const retries = addedMatching(productionFiles, RETRY);

  if (retries.length > 0) {
    addCheck(
      'retries',
      'Are retries bounded, with backoff and jitter, and is the retried operation idempotent?',
      'Unbounded or synchronised retries turn a brief outage into a sustained one.',
      retries,
    );
  }

  const messaging = addedMatching(productionFiles, MESSAGING);

  if (messaging.length > 0) {
    addCheck(
      'messaging',
      'What happens if this message or job is delivered twice, or never?',
      'Queues and webhooks deliver at least once. Consumers have to be idempotent.',
      messaging,
    );
  }

  const concurrency = addedMatching(productionFiles, CONCURRENCY);

  if (concurrency.length > 0) {
    addCheck(
      'concurrency',
      'Is the new concurrency bounded, and is it cleaned up on shutdown or error?',
      'Unbounded fan-out and leaked timers or goroutines show up as memory growth days later.',
      concurrency,
    );
  }

  const caching = addedMatching(productionFiles, CACHING);

  if (caching.length > 0) {
    addCheck(
      'caching',
      'What invalidates this cache entry, and what happens when the cache is down?',
      'Stale reads and a cache outage becoming a full outage are the two usual failures.',
      caching,
    );
  }

  signals.sort((a, b) => b.weight - a.weight);

  const score = Math.min(
    100,
    signals.reduce((sum, signal) => sum + signal.weight, 0),
  );

  return {
    level: levelFor(score),
    score,
    stats,
    signals,
    checklist: [...checks.values()]
      .sort((a, b) => CHECK_PRIORITY.indexOf(a.id) - CHECK_PRIORITY.indexOf(b.id))
      .slice(0, MAX_CHECKS),
  };
}

/**
 * For the review pipeline. Risk Radar is an addition to a review, never a
 * reason for one to fail: a pattern bug here must cost the comment its risk
 * section, not cost the user their review and a BullMQ retry.
 */
export function tryAssessRisk(diff: string): RiskAssessment | null {
  try {
    return assessRisk(diff);
  } catch {
    return null;
  }
}

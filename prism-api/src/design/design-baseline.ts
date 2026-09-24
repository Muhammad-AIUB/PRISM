import type {
  BlueprintContent,
  DesignBrief,
  DesignScale,
  ReadinessItem,
} from './blueprint';
import { SCALE_PROFILES } from './blueprint';

/**
 * The part of Design Studio that needs no model.
 *
 * Two jobs. First, the production-readiness checklist every blueprint carries:
 * the things a system at a given scale needs no matter what it does, which
 * are exactly the things a generated design forgets because they are not
 * interesting. Second, a complete fallback blueprint for when Groq is rate
 * limited, slow or returns nonsense, so the developer still leaves with
 * something correct rather than an error. The review pipeline makes the same
 * choice: degrade to less, never to nothing.
 *
 * Everything here is a pure function of the brief, and is tested as one.
 */
const RANK: Record<DesignScale, number> = { prototype: 0, startup: 1, growth: 2, enterprise: 3 };

const atLeast = (brief: DesignBrief, scale: DesignScale) => RANK[brief.scale] >= RANK[scale];
const wants = (brief: DesignBrief, priority: DesignBrief['priorities'][number]) =>
  brief.priorities.includes(priority);

export function readinessChecklist(brief: DesignBrief): ReadinessItem[] {
  const items: ReadinessItem[] = [
    {
      id: 'timeouts',
      item: 'Every outbound call (HTTP, database, queue, subprocess) has an explicit timeout, shorter than its caller\'s.',
      why: 'A dependency that hangs holds a connection and a worker until something else gives out.',
    },
    {
      id: 'idempotency',
      item: 'Writes that can be retried carry an idempotency key, and consumers tolerate duplicate delivery.',
      why: 'Clients, load balancers and queues all retry. Without a key, a retry is a second charge.',
    },
    {
      id: 'retries',
      item: 'Retries are bounded, use exponential backoff with jitter, and only wrap idempotent operations.',
      why: 'Synchronised retries turn a thirty-second blip into a self-inflicted outage.',
    },
    {
      id: 'health',
      item: 'Liveness and readiness checks are separate, and readiness fails when a hard dependency is down.',
      why: 'A process that is alive but cannot serve should stop receiving traffic, not be restarted in a loop.',
    },
    {
      id: 'logs',
      item: 'Structured logs carry a request id that is propagated to every downstream call.',
      why: 'The first question in an incident is "what happened to this request", and grep is not an answer.',
    },
    {
      id: 'backups',
      item: 'Backups are automatic, and a restore has actually been performed and timed.',
      why: 'An untested backup is a hope. The restore time is your real recovery time.',
    },
    {
      id: 'migrations',
      item: 'Schema changes are expand-then-contract, so old and new code both run during a deploy.',
      why: 'Every deploy has a window where both versions are live against one database.',
    },
    {
      id: 'rollback',
      item: 'A deploy can be rolled back with one command, and that has been rehearsed.',
      why: 'Most incidents are caused by a change. The fastest mitigation is undoing it.',
    },
    {
      id: 'secrets',
      item: 'Secrets live in a secret manager or the platform\'s encrypted env, never in the repository.',
      why: 'Git history is forever; a leaked key in it has to be rotated, not deleted.',
    },
    {
      id: 'rate_limits',
      item: 'Public endpoints are rate limited per user and per IP, with a clear 429.',
      why: 'One misbehaving client should not be able to take the service from everyone else.',
    },
  ];

  if (atLeast(brief, 'startup')) {
    items.push(
      {
        id: 'alerts',
        item: 'Alerts fire on SLO burn rate (user-visible symptoms), not on CPU or individual errors.',
        why: 'Cause-based alerts page people for things users never notice and miss the things they do.',
      },
      {
        id: 'flags',
        item: 'Risky features ship behind a flag that can be turned off without a deploy.',
        why: 'A flag flip takes seconds. A rollback takes a pipeline run.',
      },
    );
  }

  if (atLeast(brief, 'growth') || wants(brief, 'high_availability')) {
    items.push({
      id: 'multi_az',
      item: 'Stateless tiers run in at least two availability zones; the database has a synchronous standby.',
      why: 'Zone failures are routine at scale. A single zone makes them your outage.',
    });
  }

  if (atLeast(brief, 'growth')) {
    items.push(
      {
        id: 'load_test',
        item: 'The main user journey has been load tested at twice the expected peak.',
        why: 'Capacity limits are found either in a test or in production. Only one is on your schedule.',
      },
      {
        id: 'degradation',
        item: 'Non-critical dependencies sit behind circuit breakers with a defined degraded mode.',
        why: 'Recommendations being down should hide a widget, not fail checkout.',
      },
      {
        id: 'runbooks',
        item: 'Every alert links to a runbook with the first three things to check.',
        why: 'The person paged at 3am did not write the system.',
      },
    );
  }

  if (atLeast(brief, 'enterprise')) {
    items.push({
      id: 'dr',
      item: 'A written RPO and RTO per data store, with a regional failover exercised at least twice a year.',
      why: 'Disaster recovery that has never run does not work the first time.',
    });
  }

  if (wants(brief, 'security_compliance')) {
    items.push(
      {
        id: 'encryption',
        item: 'Data is encrypted in transit and at rest, with keys in a managed KMS and access to them logged.',
        why: 'Most compliance regimes ask for this first, and retrofitting it means touching every store.',
      },
      {
        id: 'audit',
        item: 'Security-relevant actions write to an append-only audit log users cannot edit.',
        why: 'After an incident, "who did what, when" has to have an answer.',
      },
    );
  }

  return items;
}

/**
 * Named after the product, so a list of saved designs is not five rows all
 * called "Baseline architecture".
 */
function baselineTitle(brief: DesignBrief): string {
  const firstSentence = brief.product.trim().split(/(?<=[.!?])\s|\n/)[0] ?? '';
  const words = firstSentence.replace(/[.!?]+$/, '').split(/\s+/).filter(Boolean);
  const name = words.slice(0, 8).join(' ');

  return `Baseline: ${words.length > 8 ? `${name}…` : name}`;
}

interface Slo {
  availability: string;
  p95: number;
}

const SLO_BY_SCALE: Record<DesignScale, Slo> = {
  prototype: { availability: '99.5%', p95: 800 },
  startup: { availability: '99.9%', p95: 500 },
  growth: { availability: '99.95%', p95: 300 },
  enterprise: { availability: '99.99%', p95: 200 },
};

/**
 * A sound, deliberately conservative design for the brief's scale. It is not
 * tailored to the product — the page labels it as a baseline — but every
 * line of it is something the tailored design would also have to answer.
 */
export function baselineBlueprint(brief: DesignBrief): BlueprintContent {
  const slo = SLO_BY_SCALE[brief.scale];
  const p95 = wants(brief, 'low_latency') ? Math.round(slo.p95 / 2) : slo.p95;
  const growth = atLeast(brief, 'growth');
  const enterprise = atLeast(brief, 'enterprise');
  const scale = SCALE_PROFILES[brief.scale];

  const components: BlueprintContent['components'] = [
    {
      name: growth ? 'Stateless API tier' : 'Application (modular monolith)',
      responsibility: 'Serves the product\'s HTTP API and pages; owns business rules, split into modules by domain.',
      technology: 'Your team\'s strongest language on a managed container platform',
      why: growth
        ? 'Stateless instances scale horizontally behind a load balancer and survive a zone loss.'
        : 'One deployable is the fastest thing to build, debug and operate at this load.',
    },
    {
      name: 'Background worker',
      responsibility: 'Runs slow or retryable work (email, webhooks, reports) off the request path.',
      technology: 'A managed queue or Redis-backed job library',
      why: 'Keeps request latency flat and gives failed work a retry with backoff instead of a 500.',
    },
    {
      name: 'Edge / CDN',
      responsibility: 'TLS termination, static assets, basic DDoS and bot protection.',
      technology: 'Your cloud\'s CDN or a managed edge provider',
      why: 'Cheapest latency and availability win available, and it shields the origin.',
    },
  ];

  if (growth) {
    components.push({
      name: 'Cache',
      responsibility: 'Read-through cache for hot, read-heavy data with explicit TTLs.',
      technology: 'Managed Redis',
      why: `At ${scale.load} the database should serve writes and cache misses, not every read.`,
    });
  }

  if (enterprise) {
    components.push({
      name: 'Event bus',
      responsibility: 'Publishes domain events so teams can build on changes without coupling to each other\'s databases.',
      technology: 'Managed Kafka or your cloud\'s pub/sub',
      why: 'At this size the constraint is team coordination as much as load.',
    });
  }

  if (wants(brief, 'offline_first')) {
    components.push({
      name: 'Client sync engine',
      responsibility: 'Local store on the device with a background sync protocol and conflict resolution.',
      technology: 'SQLite or IndexedDB on the client; versioned records on the server',
      why: 'Offline-first means the device is the primary copy while disconnected.',
    });
  }

  return {
    title: baselineTitle(brief),
    summary:
      `A conservative starting design for ${scale.label.toLowerCase()} scale (${scale.load}). ` +
      (growth
        ? 'Stateless services across availability zones in front of a primary database with a standby, with a cache and a queue taking load off the request path. '
        : 'One well-structured application and one managed relational database, with a background worker for anything slow. ') +
      'The decision that matters most is keeping state in as few places as possible: every additional store is another thing to back up, secure and keep consistent.',
    architecture_style: growth ? 'Stateless services with a shared primary database' : 'Modular monolith',
    components,
    data_stores: [
      {
        name: 'Primary database',
        kind: 'Managed PostgreSQL',
        holds: 'All transactional data',
        why: wants(brief, 'strong_consistency')
          ? 'Single-writer ACID transactions are the simplest way to get the consistency you asked for.'
          : 'Relational, transactional, and good enough for far longer than most products need.',
      },
      {
        name: 'Object storage',
        kind: 'S3-compatible bucket',
        holds: 'Uploads, exports, backups',
        why: 'Durable and cheap; keeps large blobs out of the database.',
      },
    ],
    request_flow: [
      'Client calls the API through the CDN over TLS.',
      'The API authenticates the request and applies a per-user rate limit.',
      'Business logic runs inside one database transaction, with a timeout on every call it makes.',
      'Anything slow is enqueued with an idempotency key and the API responds immediately.',
      'The worker processes the job, retrying with backoff; after the last attempt it lands in a dead-letter queue.',
    ],
    reliability: [
      { pattern: 'Timeouts', where: 'Every outbound call', why: 'Bound how long a slow dependency can hold resources.' },
      { pattern: 'Retries with backoff and jitter', where: 'Idempotent calls and background jobs', why: 'Absorb transient failures without a thundering herd.' },
      { pattern: 'Idempotency keys', where: 'Create/charge endpoints and job handlers', why: 'Make retries and duplicate deliveries safe.' },
      { pattern: 'Dead-letter queue', where: 'Background worker', why: 'Failed work is kept and visible, not lost.' },
      ...(growth
        ? [{ pattern: 'Circuit breaker', where: 'Calls to non-critical dependencies', why: 'Fail fast and degrade instead of queueing behind a sick service.' }]
        : []),
    ],
    failure_modes: [
      {
        failure: 'A downstream dependency becomes slow rather than failing',
        impact: 'Request threads and connections pile up until the whole API stops responding.',
        mitigation: 'Per-call timeouts well under the request budget; circuit breaker after repeated timeouts.',
        detection: 'p95 latency per dependency; saturation of the connection pool.',
      },
      {
        failure: 'The same request or job is delivered twice',
        impact: 'Double charges, duplicate emails, duplicated rows.',
        mitigation: 'Idempotency key stored with a unique constraint; handlers check it before acting.',
        detection: 'Unique-constraint violations on the idempotency table, counted and alerted.',
      },
      {
        failure: 'A bad deploy',
        impact: 'Errors or data corruption for every user until it is undone.',
        mitigation: 'Health-checked rolling or canary deploys; one-command rollback; expand/contract migrations.',
        detection: 'Error-rate and latency SLO burn alerts compared against the previous version.',
      },
      {
        failure: 'Database loss or corruption',
        impact: 'Data loss up to the last good backup.',
        mitigation: 'Point-in-time recovery enabled; restores rehearsed on a schedule; standby in another zone.',
        detection: 'Automated restore test that fails loudly; replication lag alert.',
      },
    ],
    scaling_stages: [
      { stage: 'Now', trigger: `Up to the stated load (${scale.load})`, changes: 'The design above.' },
      {
        stage: 'Read pressure',
        trigger: 'Database CPU above 60% sustained, or read p95 above target',
        changes: 'Add a read replica and a cache for the hottest reads.',
      },
      {
        stage: 'Write pressure',
        trigger: 'Primary write latency climbing with no slow queries to fix',
        changes: 'Move async work off the primary; partition the largest tables; consider sharding by tenant.',
      },
    ],
    tradeoffs: [
      {
        decision: 'Service boundaries',
        chosen: growth ? 'A few services split along team lines' : 'One modular deployable',
        alternative: 'Microservice per domain',
        why: 'Every network boundary adds latency, a failure mode and an on-call surface. Split when teams need to, not before.',
      },
      {
        decision: 'Primary store',
        chosen: 'Relational database',
        alternative: 'Document or wide-column store',
        why: 'Transactions and ad-hoc queries are hard to add later; horizontal write scale rarely is the first bottleneck.',
      },
    ],
    security: [
      'Authenticate at the edge of the API; authorize every read and write against the owning tenant.',
      'Least-privilege credentials per service; no shared admin keys.',
      'Dependency and container scanning in CI.',
    ],
    observability: [
      'RED metrics (rate, errors, duration) per endpoint and per dependency.',
      'Structured logs with request ids, sampled traces across the API and worker.',
      'Queue depth and oldest-message age for every queue.',
    ],
    slos: [
      { name: 'Availability', target: `${slo.availability} of requests succeed over 30 days` },
      { name: 'Latency', target: `p95 under ${p95} ms for the main user journey over 30 days` },
    ],
    risks: [
      'Building for scale you do not have yet and shipping late because of it.',
      'Background jobs without idempotency: the first retry storm corrupts data.',
    ],
    first_milestones: [
      'Walking skeleton: one request end to end, deployed, with logs, a health check and a rollback.',
      'The core data model and its migrations.',
      'The main user journey behind a feature flag.',
      'Alerts on the two SLOs above before real users arrive.',
    ],
  };
}

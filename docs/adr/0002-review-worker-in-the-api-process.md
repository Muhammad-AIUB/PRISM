# 0002. Run the review worker inside the API process

Status: Accepted
Date: 2026-08-30 (BullMQ worker ported in `a6e640a`; the sizing lesson dates from `5eca1c6`, 2026-06-22)

## Context

Reviews are slow (seconds to minutes) and call two external services, so they cannot run inside a
webhook request: GitHub gives a delivery 10 seconds. They need a queue and a worker.

PRism runs on Render's free tier. It offers web services only, no background-worker type, with
512 MB of memory each. The earlier PHP deployment ran review jobs inside its web workers and was
OOM-killed repeatedly when review activity pushed memory past the limit (`5eca1c6`).

## Decision

The BullMQ worker (`ReviewProcessor`) is registered in the same Nest application that serves HTTP,
with **`concurrency: 1`**. A job's payload is only a row id, so a worker in any process could run it.

## Consequences

- Peak memory is predictable: one review at a time, a diff read capped at 2,000,000 bytes, a database
  pool of 5.
- Throughput is one review at a time per instance. A burst of pushes queues and drains in order.
- The worker shares the event loop with HTTP, and cannot scale independently of the API.
- A deploy or crash can interrupt a job. BullMQ retries it; a row can be left in `analyzing` if its job
  is lost ([operations.md](../operations.md#a-review-is-stuck-on-pending-or-analyzing)).
- Design Studio, which also calls Groq, runs inline on its request instead of on this queue, because a
  design waiting behind several reviews would wait minutes ([ADR 0009](0009-design-studio-inline-and-in-redis.md)).
- More than one API instance means more than one worker. The code is correct on one instance and has
  find-then-insert races on two ([known-issues.md](../known-issues.md#integrity-gaps)).

## Alternatives considered

- **A separate worker service.** The right shape once hosting allows it, and the code already supports
  it (the job carries only an id). Rejected for now: no free-tier worker type, and a second web service
  would spend the free instance-hours.
- **Run reviews inside the webhook request.** Rejected: exceeds GitHub's timeout and loses the work on
  any failure.
- **Higher concurrency.** Rejected: it is exactly what breached 512 MB before.

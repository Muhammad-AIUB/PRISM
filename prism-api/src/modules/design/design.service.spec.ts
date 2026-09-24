import { HttpException, NotFoundException } from '@nestjs/common';
import { RateLimitedError } from '../../ai/ai-client.service';
import type { User } from '../../database/entities';
import type { Blueprint, DesignBrief } from '../../design/blueprint';
import { DESIGN_RATE_LIMIT, DesignService } from './design.service';

const user = { id: 1 } as User;

const brief: DesignBrief = {
  product: 'A marketplace where local bakeries take pre-orders for weekend pickup.',
  scale: 'startup',
  priorities: ['low_cost'],
  constraints: '',
};

const GOOD = {
  title: 'Bakery pre-orders',
  summary: 'A monolith.',
  components: [{ name: 'API', responsibility: 'r', technology: 't', why: 'w' }],
  failure_modes: [{ failure: 'Payment provider slow', impact: 'i', mitigation: 'm', detection: 'd' }],
};

function build(ai: { callWithFallback: jest.Mock }, hits = 1) {
  const saved: Blueprint[] = [];
  const store = {
    hit: jest.fn().mockResolvedValue(hits),
    save: jest.fn(async (_owner: number, blueprint: Blueprint) => {
      saved.push(blueprint);
    }),
    find: jest.fn(),
    list: jest.fn(),
    delete: jest.fn(),
  };
  const auditLog = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new DesignService(ai as never, store as never, auditLog as never);

  return { service, store, auditLog, saved };
}

describe('DesignService.create', () => {
  it('saves and returns a tailored blueprint with the deterministic checklist attached', async () => {
    const ai = {
      callWithFallback: jest.fn().mockResolvedValue({ model: 'groq/llama-3.3-70b-versatile', parsed: GOOD, raw: '' }),
    };
    const { service, saved, auditLog } = build(ai);

    const design = await service.create(user, brief);

    expect(design).toMatchObject({
      title: 'Bakery pre-orders',
      source: 'ai',
      model: 'groq/llama-3.3-70b-versatile',
      notice: null,
      brief,
    });
    expect(design.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(design.created_at).toMatch(/\+00:00$/);
    expect(design.readiness_checklist.length).toBeGreaterThan(0);
    expect(saved).toEqual([design]);
    expect(auditLog.record).toHaveBeenCalledWith(1, 'design_created', expect.any(String), {
      design_id: design.id,
      source: 'ai',
    });
  });

  it('asks the model with the design context and a cancellable budget', async () => {
    const ai = { callWithFallback: jest.fn().mockResolvedValue({ model: 'm', parsed: GOOD, raw: '' }) };
    const { service } = build(ai);

    await service.create(user, brief);

    const [, prompt, context, signal] = ai.callWithFallback.mock.calls[0] as unknown[];

    expect(prompt).toContain('weekend pickup');
    expect(context).toBe('design_advice');
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ['unusable output', jest.fn().mockResolvedValue({ model: 'm', parsed: { summary: 'prose' }, raw: 'prose' }), /could not use/],
    ['no model answering at all', jest.fn().mockResolvedValue({ model: 'm', parsed: null, raw: null }), /did not answer,/],
    ['every model rate limited', jest.fn().mockRejectedValue(new RateLimitedError('m')), /rate limited/],
    ['the budget running out', jest.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')), /in time/],
  ])('degrades to the labelled baseline on %s instead of failing', async (_case, call, notice) => {
    const { service, saved } = build({ callWithFallback: call });

    const design = await service.create(user, brief);

    expect(design.source).toBe('baseline');
    expect(design.model).toBeNull();
    expect(design.notice).toMatch(notice);
    expect(design.components.length).toBeGreaterThan(0);
    expect(saved).toHaveLength(1);
  });

  it('refuses past the per-user limit with the exact 429 body, before calling the model', async () => {
    const ai = { callWithFallback: jest.fn() };
    const { service } = build(ai, DESIGN_RATE_LIMIT + 1);

    const attempt = service.create(user, brief);

    await expect(attempt).rejects.toBeInstanceOf(HttpException);
    await expect(attempt).rejects.toThrow('Too Many Attempts.');
    expect(ai.callWithFallback).not.toHaveBeenCalled();
  });
});

describe('DesignService.show / remove', () => {
  const id = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

  it('answers malformed, missing and foreign ids with one 404, touching Redis only for well-formed ones', async () => {
    const { service, store } = build({ callWithFallback: jest.fn() });

    store.find.mockResolvedValue(null);

    await expect(service.show(user, 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundException);
    expect(store.find).not.toHaveBeenCalled();

    await expect(service.show(user, id)).rejects.toThrow('Design not found.');
    expect(store.find).toHaveBeenCalledWith(1, id);
  });

  it('names the Markdown download after the title', async () => {
    const { service, store } = build({ callWithFallback: jest.fn() });
    const ai = { callWithFallback: jest.fn().mockResolvedValue({ model: 'm', parsed: GOOD, raw: '' }) };
    const design = await build(ai).service.create(user, brief);

    store.find.mockResolvedValue({ ...design, title: 'Bakery: Pre-orders (v2)!' });

    const { filename, body } = await service.markdown(user, id);

    expect(filename).toBe('bakery-pre-orders-v2.md');
    expect(body.startsWith('# Bakery: Pre-orders (v2)!')).toBe(true);
  });

  it('404s a delete of something the user does not have', async () => {
    const { service, store } = build({ callWithFallback: jest.fn() });

    store.delete.mockResolvedValue(false);

    await expect(service.remove(user, id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

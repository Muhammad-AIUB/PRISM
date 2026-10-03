import 'reflect-metadata';
import { type CanActivate, type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiExceptionFilter } from '../../common/filters/api-exception.filter';
import { validationException } from '../../common/validation/validation-errors';
import { WebAuthGuard } from '../auth/web-auth.guard';
import { RepositoriesController } from './repositories.controller';
import { RepositoriesService } from './repositories.service';

// @nestjs/jwt ships ESM that jest cannot load; WebAuthGuard is overridden below
// so the real JwtService is never constructed.
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

/**
 * GET /repositories/:repository/reviews over real HTTP, with the pipe and the
 * filter main.ts installs. The service spec cannot see what the query string
 * turns into on the way in: that `page` arrives as a number, and that a value
 * the endpoint does not accept is a 422 in the usual envelope and never
 * reaches the service.
 */
describe('GET /repositories/:repository/reviews', () => {
  let app: INestApplication;
  let base: string;

  const reviews = jest.fn();
  const branches = jest.fn();

  const allow: CanActivate = {
    canActivate: (context) => {
      context.switchToHttp().getRequest().user = { id: 7 };
      return true;
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RepositoriesController],
      providers: [{ provide: RepositoriesService, useValue: { reviews, branches } }],
    })
      .overrideGuard(WebAuthGuard)
      .useValue(allow)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    // The same pipe and filter as main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
        exceptionFactory: validationException,
      }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    reviews.mockReset().mockResolvedValue({ items: [] });
    branches.mockReset().mockResolvedValue({ branches: [] });
  });

  it('passes the id and the page to the service as numbers', async () => {
    const response = await fetch(`${base}/repositories/3/reviews?kind=commits&page=2`);

    expect(response.status).toBe(200);
    expect(reviews).toHaveBeenCalledWith({ id: 7 }, 3, { kind: 'commits', page: 2 });
  });

  it('accepts a bare request and leaves the defaults to the service', async () => {
    const response = await fetch(`${base}/repositories/3/reviews`);

    expect(response.status).toBe(200);
    expect(reviews).toHaveBeenCalledWith({ id: 7 }, 3, {});
  });

  it.each(['kind=all', 'page=0', 'page=abc', 'sort=score'])(
    'answers 422 in the validation envelope for ?%s',
    async (query) => {
      const response = await fetch(`${base}/repositories/3/reviews?${query}`);
      const body = (await response.json()) as { message?: string; errors?: object };

      expect(response.status).toBe(422);
      expect(typeof body.message).toBe('string');
      expect(Object.keys(body.errors ?? {})).toEqual([query.split('=')[0]]);
      expect(reviews).not.toHaveBeenCalled();
    },
  );

  it('answers 400 for an id that is not a number', async () => {
    const response = await fetch(`${base}/repositories/abc/reviews`);

    expect(response.status).toBe(400);
    expect(reviews).not.toHaveBeenCalled();
  });

  it('leaves /repositories/branches to its own handler', async () => {
    const response = await fetch(`${base}/repositories/branches?full_name=owner/repo`);

    expect(response.status).toBe(200);
    expect(branches).toHaveBeenCalledWith({ id: 7 }, 'owner/repo');
    expect(reviews).not.toHaveBeenCalled();
  });
});

import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '../database/entities';

export interface AuthenticatedRequest extends Request {
  user?: User;
  tokenAbilities?: string[];
}

/**
 * Equivalent of Laravel's `$request->user()` on a guarded route.
 *
 * Throws rather than returning undefined: reaching a handler with no user
 * means the route is missing its guard, and failing loudly beats handing the
 * handler an undefined it will dereference into someone else's data.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new Error(
        'CurrentUser used on a route with no auth guard. Use OptionalCurrentUser for public routes.',
      );
    }

    return request.user;
  },
);

/**
 * For routes that are public but render differently when signed in — /security
 * is the one, and it is public precisely so visitors can read the trust
 * content BEFORE authorising anything. Pair with OptionalWebAuthGuard.
 */
export const OptionalCurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User | undefined =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
);

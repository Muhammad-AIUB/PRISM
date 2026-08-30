import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '../database/entities';

export interface AuthenticatedRequest extends Request {
  user?: User;
  tokenAbilities?: string[];
}

/** Equivalent of Laravel's `$request->user()`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new Error('CurrentUser used on a route without SanctumAuthGuard.');
    }

    return request.user;
  },
);

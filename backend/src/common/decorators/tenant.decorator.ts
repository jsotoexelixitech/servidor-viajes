import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Tenant } from '../../modules/tenant/entities/tenant.entity';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Tenant => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenant;
  },
);

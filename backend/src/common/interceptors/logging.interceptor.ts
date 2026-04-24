import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url, body, ip } = req;
    const tenantId = req.tenant?.id ?? 'anonymous';
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          const elapsed = Date.now() - start;
          this.logger.log(
            `${method} ${url} ${res.statusCode} +${elapsed}ms tenant=${tenantId} ip=${ip}`,
          );
        },
        error: (err) => {
          const elapsed = Date.now() - start;
          this.logger.error(
            `${method} ${url} ERROR +${elapsed}ms tenant=${tenantId} ip=${ip} :: ${err.message}`,
          );
        },
      }),
    );
  }
}

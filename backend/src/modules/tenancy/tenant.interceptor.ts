import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tenantContext } from './tenant-context';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const companyId = context.switchToHttp().getRequest().user?.company_id;
    if (!companyId) return next.handle();

    // Subscribe inside the context: Nest invokes controllers lazily through RxJS,
    // after the async guard has returned to its caller's context.
    return new Observable(subscriber => tenantContext.run({ companyId }, () =>
      next.handle().subscribe(subscriber),
    ));
  }
}

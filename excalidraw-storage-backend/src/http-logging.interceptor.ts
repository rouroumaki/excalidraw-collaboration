import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HttpLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<{ method: string; url: string }>();
    const res = http.getResponse<{ statusCode: number }>();

    return next.handle().pipe(
      finalize(() => {
        const { method, url } = req;
        const statusCode = res.statusCode;
        this.logger.log(`${method} ${url} ${statusCode}`);
      }),
    );
  }
}

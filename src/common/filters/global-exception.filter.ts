import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { IApiErrorResponse } from '../dtos/response.dto';
import { ErrorCode } from '../enums/error-code.enum';

// ─── Internal shape that NestJS packs inside HttpException.getResponse() ─────
interface INestHttpExceptionBody {
  statusCode?: number;
  error?: string;
  message?: string | string[];
}

// ─── Helper: safely read x-request-id header ─────────────────────────────────
function getRequestId(request: Request): string | undefined {
  const id = request.headers['x-request-id'];
  return Array.isArray(id) ? id[0] : id;
}

// ─── Helper: always return an array of strings ────────────────────────────────
function normalizeMessages(raw: unknown): string[] {
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw)) return raw.map(String);
  return ['An unexpected error occurred'];
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, errorCode, message, errors } =
      this.resolveException(exception);

    // Only log the full stack for server-side errors
    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `[${request.method}] ${request.url} → ${status} (${errorCode})`,
      );
    }

    const body: IApiErrorResponse = {
      success: false,
      statusCode: status,
      errorCode,
      message,
      errors,
      timestamp: new Date().toISOString(),
      path: request.url.split('?')[0],
      requestId: getRequestId(request),
    };

    response.status(status).json(body);
  }

  // ─── Main resolver ─────────────────────────────────────────────────────────

  private resolveException(exception: unknown): {
    status: number;
    errorCode: string;
    message: string;
    errors: string[];
  } {
    // 1. NestJS HTTP exceptions (includes class-validator via ValidationPipe)
    if (exception instanceof HttpException) {
      return this.resolveHttpException(exception);
    }

    // 2. Prisma known request errors (e.g. unique constraint, record not found)
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.resolvePrismaKnownError(exception);
    }

    // 3. Prisma validation errors (schema-level issues before hitting DB)
    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: 'Database query validation failed',
        errors: ['Invalid data provided to the database query'],
      };
    }

    // 4. Generic JS errors
    if (exception instanceof Error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        errors: ['An unexpected error occurred'],
      };
    }

    // 5. Completely unknown thrown value
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      errors: ['An unexpected error occurred'],
    };
  }

  // ─── HttpException resolver ────────────────────────────────────────────────

  private resolveHttpException(exception: HttpException): {
    status: number;
    errorCode: string;
    message: string;
    errors: string[];
  } {
    const status = exception.getStatus();
    const rawResponse = exception.getResponse();

    let nestBody: INestHttpExceptionBody = {};

    if (typeof rawResponse === 'string') {
      nestBody = { message: rawResponse };
    } else if (typeof rawResponse === 'object' && rawResponse !== null) {
      nestBody = rawResponse;
    }

    const isValidation = Array.isArray(nestBody.message);

    // Prioritize the errorCode if it's already defined in the exception body (e.g. from DomainException)
    // Otherwise fallback to mapping the HTTP status
    const errorCode =
      typeof nestBody.error === 'string' &&
      Object.values(ErrorCode).includes(nestBody.error as ErrorCode)
        ? nestBody.error
        : this.httpStatusToErrorCode(status, isValidation);

    const message = isValidation
      ? 'Validation failed'
      : typeof nestBody.message === 'string'
        ? nestBody.message
        : exception.message;

    const errors = normalizeMessages(nestBody.message);

    return { status, errorCode, message, errors };
  }

  // ─── Prisma known-error resolver ───────────────────────────────────────────

  private resolvePrismaKnownError(
    exception: Prisma.PrismaClientKnownRequestError,
  ): {
    status: number;
    errorCode: string;
    message: string;
    errors: string[];
  } {
    switch (exception.code) {
      // Record not found
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          errorCode: ErrorCode.DB_RECORD_NOT_FOUND,
          message: 'Resource not found',
          errors: [
            typeof exception.meta?.cause === 'string'
              ? exception.meta.cause
              : 'The requested record does not exist',
          ],
        };

      // Unique constraint violation
      case 'P2002': {
        const fields = Array.isArray(exception.meta?.target)
          ? (exception.meta.target as string[]).join(', ')
          : 'unknown field';
        return {
          status: HttpStatus.CONFLICT,
          errorCode: ErrorCode.DB_UNIQUE_CONSTRAINT,
          message: 'Duplicate entry',
          errors: [`A record with the same ${fields} already exists`],
        };
      }

      // Foreign key constraint
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          errorCode: ErrorCode.DB_FOREIGN_KEY_CONSTRAINT,
          message: 'Referential integrity violation',
          errors: ['The referenced record does not exist'],
        };

      // Required field missing
      case 'P2011':
      case 'P2012':
        return {
          status: HttpStatus.BAD_REQUEST,
          errorCode: ErrorCode.VALIDATION_ERROR,
          message: 'Missing required field',
          errors: [exception?.message ?? 'Missing required field'],
        };

      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
          message: 'Database error',
          errors: ['An error occurred while processing the database request'],
        };
    }
  }

  // ─── HTTP status → ErrorCode mapping ──────────────────────────────────────

  private httpStatusToErrorCode(status: number, isValidation: boolean): string {
    if (isValidation) return ErrorCode.VALIDATION_ERROR;

    const map: Record<number, ErrorCode> = {
      [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
      [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
      [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
      [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
      [HttpStatus.METHOD_NOT_ALLOWED]: ErrorCode.METHOD_NOT_ALLOWED,
      [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
      [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.UNPROCESSABLE_ENTITY,
      [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TOO_MANY_REQUESTS,
      [HttpStatus.INTERNAL_SERVER_ERROR]: ErrorCode.INTERNAL_SERVER_ERROR,
      [HttpStatus.BAD_GATEWAY]: ErrorCode.BANK_INTEGRATION_FAILED,
      [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.EXCHANGE_API_UNAVAILABLE,
      [HttpStatus.GATEWAY_TIMEOUT]: ErrorCode.EXTERNAL_API_TIMEOUT,
    };

    return map[status] ?? ErrorCode.INTERNAL_SERVER_ERROR;
  }
}

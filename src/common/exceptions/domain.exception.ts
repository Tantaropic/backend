import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../enums/error-code.enum';

/**
 * Base class for all domain-specific exceptions in this project.
 * Extends `HttpException` so the GlobalExceptionFilter handles it automatically.
 *
 * Usage:
 *   throw new DomainException('Insufficient funds', HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.INSUFFICIENT_FUNDS);
 */
export class DomainException extends HttpException {
  public readonly errorCode: string;

  constructor(
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    errorCode: string = ErrorCode.BAD_REQUEST,
  ) {
    super({ message, error: errorCode, statusCode: status }, status);
    this.errorCode = errorCode;
  }
}

// ─── Convenience subclasses ───────────────────────────────────────────────────

export class NotFoundException extends DomainException {
  constructor(resource: string, id?: string) {
    super(
      id
        ? `${resource} with id "${id}" was not found`
        : `${resource} not found`,
      ~HttpStatus.NOT_FOUND,
      ErrorCode.NOT_FOUND,
    );
  }
}

export class InsufficientFundsException extends DomainException {
  constructor(available?: number, required?: number) {
    const detail =
      available !== undefined && required !== undefined
        ? ` (available: ${available}, required: ${required})`
        : '';
    super(
      `Insufficient funds${detail}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.INSUFFICIENT_FUNDS,
    );
  }
}

export class ConflictException extends DomainException {
  constructor(message: string) {
    super(message, HttpStatus.CONFLICT, ErrorCode.CONFLICT);
  }
}

export class ForbiddenException extends DomainException {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN);
  }
}

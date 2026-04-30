import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig, isAxiosError } from 'axios';
import { serialize } from '../helpers/json-helper';
import { ErrorCode } from '../enums/error-code.enum';
import { DomainException } from '../exceptions/domain.exception';

interface ExternalApiErrorData {
  message?: string;
  statusCode?: number;
  error?: string;
}

/**
 * Enhanced HTTP Client with BigInt support and centralized logging.
 * Acts as a wrapper around NestJS HttpService.
 */
@Injectable()
export class HttpClientService {
  private readonly logger = new Logger(HttpClientService.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * Performs a POST request with BigInt serialization support.
   */
  async post<T = any, R = any>(
    url: string,
    data?: T,
    config?: AxiosRequestConfig,
  ): Promise<R> {
    const serializedData = serialize<T>(data);

    const requestConfig: AxiosRequestConfig = {
      ...config,
      headers: {
        ...(serializedData ? { 'Content-Type': 'application/json' } : {}),
        ...config?.headers,
      },
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post<R>(url, serializedData, requestConfig),
      );
      return response.data;
    } catch (error) {
      this.handleError(error, 'POST', url);
    }
  }

  /**
   * Performs a GET request.
   */
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<T>(url, config),
      );
      return response.data;
    } catch (error) {
      this.handleError(error, 'GET', url);
    }
  }

  /**
   * Performs a PATCH request.
   */
  async patch<T = any, R = any>(
    url: string,
    data?: T,
    config?: AxiosRequestConfig,
  ): Promise<R> {
    const serializedData = serialize<T>(data);

    const requestConfig: AxiosRequestConfig = {
      ...config,
      headers: {
        ...(serializedData ? { 'Content-Type': 'application/json' } : {}),
        ...config?.headers,
      },
    };

    try {
      const response = await firstValueFrom(
        this.httpService.patch<R>(url, serializedData, requestConfig),
      );
      return response.data;
    } catch (error) {
      this.handleError(error, 'PATCH', url);
    }
  }

  /**
   * Performs a DELETE request.
   */
  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.delete<T>(url, config),
      );
      return response.data;
    } catch (error) {
      this.handleError(error, 'DELETE', url);
    }
  }

  /**
   * Centralized error handling for external API calls.
   */
  private handleError(error: unknown, method: string, url: string): never {
    let errorMessage = 'An unknown error occurred';
    let status = HttpStatus.INTERNAL_SERVER_ERROR;

    if (isAxiosError<ExternalApiErrorData>(error)) {
      errorMessage = error.response?.data?.message || error.message;
      status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = String(error);
    }

    this.logger.error(
      `[External API] ${method} ${url} failed: ${errorMessage}`,
    );

    // Determine the specific error code based on the URL or error type
    let errorCode = ErrorCode.EXTERNAL_API_TIMEOUT;

    if (url.includes('mock-bank')) {
      errorCode = ErrorCode.BANK_INTEGRATION_FAILED;
    } else if (url.includes('exchange')) {
      errorCode = ErrorCode.EXCHANGE_API_UNAVAILABLE;
    }

    // Check for timeout specifically
    if (
      isAxiosError(error) &&
      (error.code === 'ECONNABORTED' || error.message.includes('timeout'))
    ) {
      errorCode = ErrorCode.EXTERNAL_API_TIMEOUT;
      status = HttpStatus.GATEWAY_TIMEOUT;
    }

    // Throw the domain-safe exception
    throw new DomainException(errorMessage, status, errorCode);
  }
}

import { IApiResponse } from '../dtos/response.dto';

/**
 * Factory function to construct a typed success envelope.
 * Use this inside every controller or service that returns data directly
 * (rather than relying on an interceptor).
 * @param data
 * @param message
 * @param statusCode
 * @param path
 * @param requestId
 * @returns
 * @example
 * return ok(user, 'User created successfully', 201);
 */
export function ok<T>(
  data: T,
  message = 'Success',
  statusCode = 200,
  requestId?: string,
  path?: string,
): IApiResponse<T> {
  return {
    success: true,
    statusCode,
    message,
    data,
    timestamp: new Date().toISOString(),
    requestId,
    path,
  };
}

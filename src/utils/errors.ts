/**
 * SeraphC2 Error Handling and Validation Utilities
 * Centralized error management with structured error types
 */

import { log } from './logger';

// Base error class for SeraphC2
export abstract class SeraphError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly timestamp: Date;
  public readonly context: Record<string, unknown> | undefined;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date();
    this.context = context;

    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      context: this.context,
    };
  }
}

// Specific error types
export class ValidationError extends SeraphError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, true, context);
  }
}

export class AuthenticationError extends SeraphError {
  constructor(message: string = 'Authentication failed', context?: Record<string, unknown>) {
    super(message, 'AUTHENTICATION_ERROR', 401, true, context);
  }
}

export class AuthorizationError extends SeraphError {
  constructor(message: string = 'Access denied', context?: Record<string, unknown>) {
    super(message, 'AUTHORIZATION_ERROR', 403, true, context);
  }
}

export class NotFoundError extends SeraphError {
  constructor(resource: string, context?: Record<string, unknown>) {
    super(`${resource} not found`, 'NOT_FOUND_ERROR', 404, true, context);
  }
}

export class ConflictError extends SeraphError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFLICT_ERROR', 409, true, context);
  }
}

export class CommunicationError extends SeraphError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'COMMUNICATION_ERROR', 502, true, context);
  }
}

export class ConfigurationError extends SeraphError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIGURATION_ERROR', 500, false, context);
  }
}

export class CryptographicError extends SeraphError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CRYPTOGRAPHIC_ERROR', 500, true, context);
  }
}

// Error handler utility
export class ErrorHandler {
  static handle(error: Error, context?: Record<string, unknown>): void {
    if (error instanceof SeraphError) {
      // Log structured error
      log.error(`${error.name}: ${error.message}`, error, {
        code: error.code,
        statusCode: error.statusCode,
        isOperational: error.isOperational,
        context: { ...error.context, ...context },
      });
    } else {
      // Log unexpected error
      log.error(`Unexpected error: ${error.message}`, error, context);
    }
  }

  static isOperationalError(error: Error): boolean {
    if (error instanceof SeraphError) {
      return error.isOperational;
    }
    return false;
  }

  static createErrorResponse(error: Error) {
    if (error instanceof SeraphError) {
      return {
        error: {
          name: error.name,
          message: error.message,
          code: error.code,
          timestamp: error.timestamp,
        },
      };
    }

    // Don't expose internal error details in production
    const isProduction = process.env['NODE_ENV'] === 'production';
    return {
      error: {
        name: 'InternalServerError',
        message: isProduction ? 'Internal server error' : error.message,
        code: 'INTERNAL_ERROR',
        timestamp: new Date(),
      },
    };
  }
}

// Validation utilities
export class Validator {
  static isString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string') {
      throw new ValidationError(`${fieldName} must be a string`);
    }
    return value;
  }

  static isNumber(value: unknown, fieldName: string): number {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new ValidationError(`${fieldName} must be a valid number`);
    }
    return value;
  }

  static isBoolean(value: unknown, fieldName: string): boolean {
    if (typeof value !== 'boolean') {
      throw new ValidationError(`${fieldName} must be a boolean`);
    }
    return value;
  }

  static isArray(value: unknown, fieldName: string): unknown[] {
    if (!Array.isArray(value)) {
      throw new ValidationError(`${fieldName} must be an array`);
    }
    return value;
  }

  static isObject(value: unknown, fieldName: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new ValidationError(`${fieldName} must be an object`);
    }
    return value as Record<string, unknown>;
  }

  static isEmail(value: string, fieldName: string): string {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      throw new ValidationError(`${fieldName} must be a valid email address`);
    }
    return value;
  }

  static isUUID(value: string, fieldName: string): string {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      throw new ValidationError(`${fieldName} must be a valid UUID`);
    }
    return value;
  }

  static hasMinLength(value: string, minLength: number, fieldName: string): string {
    if (value.length < minLength) {
      throw new ValidationError(`${fieldName} must be at least ${minLength} characters long`);
    }
    return value;
  }

  static hasMaxLength(value: string, maxLength: number, fieldName: string): string {
    if (value.length > maxLength) {
      throw new ValidationError(`${fieldName} must be no more than ${maxLength} characters long`);
    }
    return value;
  }

  static isInRange(value: number, min: number, max: number, fieldName: string): number {
    if (value < min || value > max) {
      throw new ValidationError(`${fieldName} must be between ${min} and ${max}`);
    }
    return value;
  }

  static isOneOf<T>(value: T, allowedValues: T[], fieldName: string): T {
    if (!allowedValues.includes(value)) {
      throw new ValidationError(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
    }
    return value;
  }

  static required<T>(value: T | null | undefined, fieldName: string): T {
    if (value === null || value === undefined) {
      throw new ValidationError(`${fieldName} is required`);
    }
    return value;
  }
}

// Async error wrapper
export function asyncHandler<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      ErrorHandler.handle(error as Error);
      throw error;
    }
  };
}

// Result type for error handling without exceptions
export type Result<T, E = Error> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: E;
    };

export function createResult<T>(data: T): Result<T> {
  return { success: true, data };
}

export function createError<E extends Error>(error: E): Result<never, E> {
  return { success: false, error };
}

export function isSuccess<T, E>(result: Result<T, E>): result is { success: true; data: T } {
  return result.success;
}

export function isError<T, E>(result: Result<T, E>): result is { success: false; error: E } {
  return !result.success;
}

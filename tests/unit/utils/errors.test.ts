/**
 * Error Handling Utility Tests
 */

import {
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ErrorHandler,
  Validator,
  asyncHandler,
  createResult,
  createError,
  isSuccess,
  isError,
} from '../../../src/utils/errors';

describe('Error Handling Utilities', () => {
  describe('SeraphError Base Class', () => {
    it('should create error with all properties', () => {
      const error = new ValidationError('Test validation error', { field: 'username' });

      expect(error.message).toBe('Test validation error');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
      expect(error.context).toEqual({ field: 'username' });
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should serialize to JSON correctly', () => {
      const error = new AuthenticationError('Invalid credentials');
      const json = error.toJSON();

      expect(json).toHaveProperty('name', 'AuthenticationError');
      expect(json).toHaveProperty('message', 'Invalid credentials');
      expect(json).toHaveProperty('code', 'AUTHENTICATION_ERROR');
      expect(json).toHaveProperty('statusCode', 401);
      expect(json).toHaveProperty('timestamp');
    });
  });

  describe('Specific Error Types', () => {
    it('should create ValidationError with correct properties', () => {
      const error = new ValidationError('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('should create AuthenticationError with correct properties', () => {
      const error = new AuthenticationError();
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.message).toBe('Authentication failed');
    });

    it('should create NotFoundError with resource name', () => {
      const error = new NotFoundError('User');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND_ERROR');
      expect(error.message).toBe('User not found');
    });
  });

  describe('ErrorHandler', () => {
    it('should identify operational errors', () => {
      const operationalError = new ValidationError('Test error');
      const systemError = new Error('System error');

      expect(ErrorHandler.isOperationalError(operationalError)).toBe(true);
      expect(ErrorHandler.isOperationalError(systemError)).toBe(false);
    });

    it('should create error response for SeraphError', () => {
      const error = new ValidationError('Invalid data');
      const response = ErrorHandler.createErrorResponse(error);

      expect(response.error.name).toBe('ValidationError');
      expect(response.error.code).toBe('VALIDATION_ERROR');
      expect(response.error.message).toBe('Invalid data');
    });

    it('should create generic error response for unknown errors', () => {
      const error = new Error('Unknown error');
      const response = ErrorHandler.createErrorResponse(error);

      expect(response.error.name).toBe('InternalServerError');
      expect(response.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('Validator', () => {
    it('should validate strings', () => {
      expect(Validator.isString('test', 'field')).toBe('test');
      expect(() => Validator.isString(123, 'field')).toThrow(ValidationError);
    });

    it('should validate numbers', () => {
      expect(Validator.isNumber(123, 'field')).toBe(123);
      expect(() => Validator.isNumber('123', 'field')).toThrow(ValidationError);
      expect(() => Validator.isNumber(NaN, 'field')).toThrow(ValidationError);
    });

    it('should validate booleans', () => {
      expect(Validator.isBoolean(true, 'field')).toBe(true);
      expect(() => Validator.isBoolean('true', 'field')).toThrow(ValidationError);
    });

    it('should validate arrays', () => {
      expect(Validator.isArray([1, 2, 3], 'field')).toEqual([1, 2, 3]);
      expect(() => Validator.isArray('not array', 'field')).toThrow(ValidationError);
    });

    it('should validate objects', () => {
      const obj = { key: 'value' };
      expect(Validator.isObject(obj, 'field')).toEqual(obj);
      expect(() => Validator.isObject(null, 'field')).toThrow(ValidationError);
      expect(() => Validator.isObject([], 'field')).toThrow(ValidationError);
    });

    it('should validate email addresses', () => {
      expect(Validator.isEmail('test@example.com', 'email')).toBe('test@example.com');
      expect(() => Validator.isEmail('invalid-email', 'email')).toThrow(ValidationError);
    });

    it('should validate UUIDs', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      expect(Validator.isUUID(uuid, 'id')).toBe(uuid);
      expect(() => Validator.isUUID('invalid-uuid', 'id')).toThrow(ValidationError);
    });

    it('should validate string length', () => {
      expect(Validator.hasMinLength('hello', 3, 'field')).toBe('hello');
      expect(() => Validator.hasMinLength('hi', 3, 'field')).toThrow(ValidationError);

      expect(Validator.hasMaxLength('hello', 10, 'field')).toBe('hello');
      expect(() => Validator.hasMaxLength('hello world', 5, 'field')).toThrow(ValidationError);
    });

    it('should validate number ranges', () => {
      expect(Validator.isInRange(5, 1, 10, 'field')).toBe(5);
      expect(() => Validator.isInRange(15, 1, 10, 'field')).toThrow(ValidationError);
    });

    it('should validate allowed values', () => {
      expect(Validator.isOneOf('red', ['red', 'green', 'blue'], 'color')).toBe('red');
      expect(() => Validator.isOneOf('yellow', ['red', 'green', 'blue'], 'color')).toThrow(
        ValidationError
      );
    });

    it('should validate required values', () => {
      expect(Validator.required('value', 'field')).toBe('value');
      expect(() => Validator.required(null, 'field')).toThrow(ValidationError);
      expect(() => Validator.required(undefined, 'field')).toThrow(ValidationError);
    });
  });

  describe('Async Handler', () => {
    it('should handle successful async functions', async () => {
      const asyncFn = asyncHandler(async (value: number) => value * 2);
      const result = await asyncFn(5);
      expect(result).toBe(10);
    });

    it('should handle async function errors', async () => {
      const asyncFn = asyncHandler(async () => {
        throw new ValidationError('Async error');
      });

      await expect(asyncFn()).rejects.toThrow(ValidationError);
    });
  });

  describe('Result Type', () => {
    it('should create success result', () => {
      const result = createResult('success data');
      expect(isSuccess(result)).toBe(true);
      expect(isError(result)).toBe(false);
      if (isSuccess(result)) {
        expect(result.data).toBe('success data');
      }
    });

    it('should create error result', () => {
      const error = new Error('Test error');
      const result = createError(error);
      expect(isError(result)).toBe(true);
      expect(isSuccess(result)).toBe(false);
      if (isError(result)) {
        expect(result.error).toBe(error);
      }
    });
  });
});

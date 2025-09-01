/**
 * SeraphC2 Utilities Index
 * Centralized exports for all utility modules
 */

// Logger utilities
export { log, default as logger } from './logger';

// Configuration utilities
export { config, configUtils, type Config } from './config';

// Error handling utilities
export {
  SeraphError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  CommunicationError,
  ConfigurationError,
  CryptographicError,
  ErrorHandler,
  Validator,
  asyncHandler,
  createResult,
  createError,
  isSuccess,
  isError,
  type Result,
} from './errors';

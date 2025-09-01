/**
 * Error handling middleware for Express.js
 * Provides centralized error handling and logging
 */

import { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

/**
 * Global error handling middleware
 */
export function errorHandler() {
  return (error: ApiError, req: Request, res: Response, _next: NextFunction) => {
    // Log the error
    console.error('API Error:', {
      message: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
    });

    // Determine status code
    const statusCode = error.statusCode || 500;

    // Determine if error details should be exposed
    const isDevelopment = process.env['NODE_ENV'] === 'development';
    const isOperationalError = error.isOperational || false;

    // Prepare error response
    const errorResponse: any = {
      success: false,
      error: 'Internal server error',
      timestamp: new Date().toISOString(),
    };

    // Add error details based on environment and error type
    if (isDevelopment || isOperationalError) {
      errorResponse.error = error.message;
    }

    if (isDevelopment) {
      errorResponse.stack = error.stack;
      errorResponse.details = {
        url: req.url,
        method: req.method,
        headers: req.headers,
        body: req.body,
      };
    }

    // Handle specific error types
    if (error.name === 'ValidationError') {
      errorResponse.error = 'Validation failed';
      errorResponse.details = error.message;
      return res.status(400).json(errorResponse);
    }

    if (error.name === 'UnauthorizedError' || error.name === 'JsonWebTokenError') {
      errorResponse.error = 'Authentication failed';
      return res.status(401).json(errorResponse);
    }

    if (error.name === 'ForbiddenError') {
      errorResponse.error = 'Access denied';
      return res.status(403).json(errorResponse);
    }

    if (error.name === 'NotFoundError') {
      errorResponse.error = 'Resource not found';
      return res.status(404).json(errorResponse);
    }

    if (error.name === 'ConflictError') {
      errorResponse.error = 'Resource conflict';
      return res.status(409).json(errorResponse);
    }

    if (error.name === 'TooManyRequestsError') {
      errorResponse.error = 'Too many requests';
      return res.status(429).json(errorResponse);
    }

    // Default error response
    return res.status(statusCode).json(errorResponse);
  };
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create operational error
 */
export function createError(message: string, statusCode: number = 500): ApiError {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
}

/**
 * Not found middleware for undefined routes
 */
export function notFoundHandler() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const error = createError(`Route ${req.originalUrl} not found`, 404);
    next(error);
  };
}

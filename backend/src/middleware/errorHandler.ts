/** Express error handling middleware. */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { AppError, ValidationError, isAppError, ErrorResponse } from '../utils/errors.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    const validationError = new ValidationError('Invalid request', { errors: err.flatten().fieldErrors });
    sendErrorResponse(res, validationError);
    return;
  }

  if (isAppError(err)) {
    sendErrorResponse(res, err);
    return;
  }

  // Unexpected error
  logger.error({ err: err instanceof Error ? err.stack : err }, 'Unhandled exception');
  const internalError = new AppError('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  sendErrorResponse(res, internalError);
}

function sendErrorResponse(res: Response, err: AppError): void {
  const response: ErrorResponse = {
    success: false,
    error: {
      code: err.code,
      message: err.message,
      details: err.details,
    },
  };

  const logLevel = err.statusCode >= 500 ? 'error' : 'warn';
  logger[logLevel]({
    code: err.code,
    message: err.message,
    statusCode: err.statusCode,
    details: err.details,
  }, 'Request error');

  res.status(err.statusCode).json(response);
}

export function notFoundHandler(_req: Request, res: Response): void {
  const response: ErrorResponse = {
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found', details: {} },
  };
  res.status(404).json(response);
}
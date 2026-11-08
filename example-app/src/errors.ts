import type { ErrorRequestHandler, RequestHandler } from 'express';

export function errorBody(code: string, message: string, details?: unknown) {
  return {
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  };
}

export const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json(errorBody('ROUTE_NOT_FOUND', 'Route not found.'));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (typeof error === 'object' && error !== null) {
    if ('type' in error && error.type === 'entity.parse.failed') {
      response.status(400).json(errorBody('INVALID_JSON', 'Request body is not valid JSON.'));
      return;
    }

    const statuses = [
      'status' in error ? error.status : undefined,
      'statusCode' in error ? error.statusCode : undefined,
    ];
    const status = statuses.find(
      (value): value is number => typeof value === 'number'
        && Number.isInteger(value) && value >= 400 && value < 500,
    );
    if (status !== undefined) {
      response.status(status).json(errorBody('BAD_REQUEST', 'Invalid request.'));
      return;
    }
  }

  console.error(error);
  response.status(500).json(errorBody('INTERNAL_ERROR', 'Internal server error.'));
};

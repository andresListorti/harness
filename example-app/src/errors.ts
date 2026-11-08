export function errorBody(code: string, message: string, details?: unknown) {
  return {
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  };
}

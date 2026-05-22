import type { Response } from 'express';

export function getRequestId(res: Response): string | undefined {
  return res.locals.requestId as string | undefined;
}

export function sendError(
  res: Response,
  status: number,
  error: string,
  extras: Record<string, unknown> = {},
): Response {
  const safeError = error.replace(/\r?\n/g, ' ').slice(0, 1000);
  return res.status(status).json({
    error: safeError,
    requestId: getRequestId(res),
    ...extras,
  });
}

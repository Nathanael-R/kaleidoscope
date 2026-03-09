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
  return res.status(status).json({
    error,
    requestId: getRequestId(res),
    ...extras,
  });
}
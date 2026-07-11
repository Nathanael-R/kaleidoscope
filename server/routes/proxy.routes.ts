import { Router } from 'express';
import type { Request, Response } from 'express';
import { proxyService } from '../services/proxy.service.js';

const router = Router();

function requestQuery(req: Request): string {
  return new URL(req.originalUrl, 'http://kaleidoscope.invalid').search;
}

function requestHeaders(req: Request): Record<string, string> {
  return Object.fromEntries(
    Object.entries(req.headers).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function requestBody(req: Request): string | undefined {
  if (req.method === 'GET' || req.method === 'HEAD' || req.body === undefined) {
    return undefined;
  }
  return typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
}

async function forward(req: Request, res: Response, targetPath: string) {
  const result = await proxyService.proxyRequest(
    req.params.sessionId,
    targetPath,
    req.method,
    requestHeaders(req),
    requestBody(req),
  );

  for (const [key, value] of Object.entries(result.headers)) {
    if (key.toLowerCase() !== 'transfer-encoding' && key.toLowerCase() !== 'content-length') {
      res.setHeader(key, value);
    }
  }
  res.status(result.status).send(result.body);
}

router.all('/:sessionId/*', async (req, res) => {
  const wildcardPath = (req.params as typeof req.params & { '0'?: string })['0'] ?? '';
  await forward(req, res, `/${wildcardPath}${requestQuery(req)}`);
});

router.all('/:sessionId', async (req, res) => {
  await forward(req, res, `/${requestQuery(req)}`);
});

export default router;

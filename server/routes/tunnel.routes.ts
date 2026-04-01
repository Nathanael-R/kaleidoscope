import { Router } from 'express';
import type { Request, Response } from 'express';
import { tunnelService } from '../services/tunnel.service.js';
import type { TunnelOptions } from '../services/tunnel.service.js';
import { sendError } from '../utils/http.js';

const router = Router();
const TUNNEL_PROVIDERS = new Set(['cloudflared', 'ngrok']);

/**
 * POST /api/tunnel/create
 * Create a new tunnel
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { port, preferredProvider } = req.body as TunnelOptions;

    if (!port || typeof port !== 'number') {
      return sendError(res, 400, 'Invalid port number');
    }

    if (port < 1 || port > 65535) {
      return sendError(res, 400, 'Port must be between 1 and 65535');
    }

    if (preferredProvider && !TUNNEL_PROVIDERS.has(preferredProvider)) {
      return sendError(res, 400, 'preferredProvider must be cloudflared or ngrok');
    }

    console.log(`Creating tunnel for port ${port}...`);
    const tunnelInfo = await tunnelService.createTunnel({
      port,
      preferredProvider
    });

    res.json({
      success: true,
      tunnel: tunnelInfo
    });
  } catch (error) {
    console.error('Error creating tunnel:', error);
    return sendError(res, 500, error instanceof Error ? error.message : 'Failed to create tunnel');
  }
});

/**
 * GET /api/tunnel/:port
 * Get tunnel info for a specific port
 */
router.get('/:port', (req: Request, res: Response) => {
  const port = parseInt(req.params.port, 10);

  if (isNaN(port)) {
    return sendError(res, 400, 'Invalid port number');
  }

  const tunnel = tunnelService.getTunnel(port);

  if (!tunnel) {
    return sendError(res, 404, 'No tunnel found for this port');
  }

  res.json({
    success: true,
    tunnel
  });
});

/**
 * GET /api/tunnel
 * Get all active tunnels
 */
router.get('/', (req: Request, res: Response) => {
  const tunnels = tunnelService.getAllTunnels();

  res.json({
    success: true,
    tunnels,
    count: tunnels.length
  });
});

/**
 * DELETE /api/tunnel/:port
 * Close a tunnel
 */
router.delete('/:port', async (req: Request, res: Response) => {
  try {
    const port = parseInt(req.params.port, 10);

    if (isNaN(port)) {
      return sendError(res, 400, 'Invalid port number');
    }

    await tunnelService.closeTunnel(port);

    res.json({
      success: true,
      message: `Tunnel for port ${port} closed`
    });
  } catch (error) {
    console.error('Error closing tunnel:', error);
    return sendError(res, 500, error instanceof Error ? error.message : 'Failed to close tunnel');
  }
});

/**
 * DELETE /api/tunnel
 * Close all tunnels
 */
router.delete('/', async (req: Request, res: Response) => {
  try {
    await tunnelService.closeAllTunnels();

    res.json({
      success: true,
      message: 'All tunnels closed'
    });
  } catch (error) {
    console.error('Error closing tunnels:', error);
    return sendError(res, 500, error instanceof Error ? error.message : 'Failed to close tunnels');
  }
});

/**
 * POST /api/tunnel/auto-detect
 * Auto-detect port and create tunnel
 */
router.post('/auto-detect', async (req: Request, res: Response) => {
  try {
    const port = await tunnelService.autoDetectPort();

    if (!port) {
      return sendError(res, 404, 'No dev server detected on common ports');
    }

    const tunnelInfo = await tunnelService.createTunnel({ port });

    res.json({
      success: true,
      tunnel: tunnelInfo,
      detectedPort: port
    });
  } catch (error) {
    console.error('Error auto-detecting and creating tunnel:', error);
    return sendError(res, 500, error instanceof Error ? error.message : 'Failed to auto-detect and create tunnel');
  }
});

export default router;

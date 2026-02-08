import { Router } from 'express';
import type { Request, Response } from 'express';
import { tunnelService } from '../services/tunnel.service.js';
import type { TunnelOptions } from '../services/tunnel.service.js';

const router = Router();

/**
 * POST /api/tunnel/create
 * Create a new tunnel
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { port, subdomain, preferredProvider } = req.body as TunnelOptions;

    if (!port || typeof port !== 'number') {
      return res.status(400).json({
        error: 'Invalid port number'
      });
    }

    if (port < 1 || port > 65535) {
      return res.status(400).json({
        error: 'Port must be between 1 and 65535'
      });
    }

    console.log(`Creating tunnel for port ${port}...`);
    const tunnelInfo = await tunnelService.createTunnel({
      port,
      subdomain,
      preferredProvider
    });

    res.json({
      success: true,
      tunnel: tunnelInfo
    });
  } catch (error) {
    console.error('Error creating tunnel:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create tunnel'
    });
  }
});

/**
 * GET /api/tunnel/:port
 * Get tunnel info for a specific port
 */
router.get('/:port', (req: Request, res: Response) => {
  const port = parseInt(req.params.port, 10);

  if (isNaN(port)) {
    return res.status(400).json({
      error: 'Invalid port number'
    });
  }

  const tunnel = tunnelService.getTunnel(port);

  if (!tunnel) {
    return res.status(404).json({
      error: 'No tunnel found for this port'
    });
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
      return res.status(400).json({
        error: 'Invalid port number'
      });
    }

    await tunnelService.closeTunnel(port);

    res.json({
      success: true,
      message: `Tunnel for port ${port} closed`
    });
  } catch (error) {
    console.error('Error closing tunnel:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to close tunnel'
    });
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
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to close tunnels'
    });
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
      return res.status(404).json({
        error: 'No dev server detected on common ports'
      });
    }

    const tunnelInfo = await tunnelService.createTunnel({ port });

    res.json({
      success: true,
      tunnel: tunnelInfo,
      detectedPort: port
    });
  } catch (error) {
    console.error('Error auto-detecting and creating tunnel:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to auto-detect and create tunnel'
    });
  }
});

export default router;

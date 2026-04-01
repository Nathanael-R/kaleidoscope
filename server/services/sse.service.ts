import type { Request, Response } from 'express';

type SSEClient = {
  clientId: string;
  res: Response;
};

class SSEService {
  private clients: Map<string, SSEClient> = new Map();

  /**
   * Handle a new SSE connection. Call this from a GET endpoint.
   * Sets headers, sends initial connection event, and registers cleanup.
   */
  addClient(
    req: Request,
    res: Response,
    options: {
      clientId: string;
      accessControlAllowOrigin?: string;
    },
  ): void {
    const { clientId, accessControlAllowOrigin } = options;
    const existingClient = this.clients.get(clientId);
    if (existingClient) {
      existingClient.res.end();
      this.clients.delete(clientId);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    };

    if (accessControlAllowOrigin) {
      headers['Access-Control-Allow-Origin'] = accessControlAllowOrigin;
    }

    res.writeHead(200, headers);

    // Send initial connected event
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

    this.clients.set(clientId, { clientId, res });
    console.log(`SSE client connected: ${clientId} (${this.clients.size} total)`);

    // Remove on disconnect
    req.on('close', () => {
      const current = this.clients.get(clientId);
      if (current?.res === res) {
        this.clients.delete(clientId);
      }
      console.log(`SSE client disconnected: ${clientId} (${this.clients.size} total)`);
    });
  }

  /**
   * Send an event to a specific connected client.
   */
  sendToClient(clientId: string, event: string, data: unknown): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }

    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    client.res.write(payload);
    return true;
  }

  /**
   * Number of connected clients.
   */
  get clientCount(): number {
    return this.clients.size;
  }
}

export const sseService = new SSEService();

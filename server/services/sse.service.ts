import type { Request, Response } from 'express';

type SSEClient = {
  id: string;
  res: Response;
};

class SSEService {
  private clients: SSEClient[] = [];
  private nextId = 1;

  /**
   * Handle a new SSE connection. Call this from a GET endpoint.
   * Sets headers, sends initial connection event, and registers cleanup.
   */
  addClient(req: Request, res: Response): void {
    const id = String(this.nextId++);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send initial connected event
    res.write(`event: connected\ndata: ${JSON.stringify({ id })}\n\n`);

    this.clients.push({ id, res });
    console.log(`SSE client connected: ${id} (${this.clients.length} total)`);

    // Remove on disconnect
    req.on('close', () => {
      this.clients = this.clients.filter(c => c.id !== id);
      console.log(`SSE client disconnected: ${id} (${this.clients.length} total)`);
    });
  }

  /**
   * Broadcast an event to all connected clients.
   */
  broadcast(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      client.res.write(payload);
    }
  }

  /**
   * Number of connected clients.
   */
  get clientCount(): number {
    return this.clients.length;
  }
}

export const sseService = new SSEService();

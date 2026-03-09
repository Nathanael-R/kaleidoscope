// Server-side types
export interface HealthResponse {
  status: string;
  timestamp: string;
  requestId?: string;
}
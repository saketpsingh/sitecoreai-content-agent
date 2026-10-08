export interface TraceEvent {
  sessionId: string;
  operation: string;
  status: 'started' | 'completed' | 'failed';
  duration?: number;
  metadata?: Record<string, unknown>;
  error?: string;
}

const traces: TraceEvent[] = [];

export function logTrace(event: TraceEvent): void {
  traces.push({ ...event, metadata: { ...event.metadata, timestamp: new Date().toISOString() } });

  if (process.env.NODE_ENV === 'development') {
    console.log(`[TRACE] ${event.operation} - ${event.status}`, event.metadata || '');
  }
}

export function startTrace(sessionId: string, operation: string): (error?: string) => void {
  const startTime = Date.now();
  logTrace({ sessionId, operation, status: 'started' });

  return (error?: string) => {
    logTrace({
      sessionId,
      operation,
      status: error ? 'failed' : 'completed',
      duration: Date.now() - startTime,
      error,
    });
  };
}

export function getTraces(sessionId?: string): TraceEvent[] {
  return sessionId ? traces.filter(t => t.sessionId === sessionId) : traces;
}

export function clearTraces(): void {
  traces.length = 0;
}

export function exportTracesForPortkey(sessionId: string): object {
  const sessionTraces = getTraces(sessionId);
  return {
    sessionId,
    traceCount: sessionTraces.length,
    traces: sessionTraces,
    exportedAt: new Date().toISOString(),
  };
}

export async function sendTracesToPortkey(sessionId: string): Promise<void> {
  const baseUrl = process.env.PORTKEY_GATEWAY_URL;
  const apiKey = process.env.PORTKEY_API_KEY;

  if (!baseUrl || !apiKey) {
    console.warn('Portkey not configured, skipping trace export');
    return;
  }

  const traceData = exportTracesForPortkey(sessionId);

  try {
    await fetch(`${baseUrl}/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-portkey-api-key': apiKey,
      },
      body: JSON.stringify(traceData),
    });
  } catch (error) {
    console.error('Failed to send traces to Portkey:', error);
  }
}

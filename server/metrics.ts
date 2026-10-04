// Minimal Prometheus-style metrics, no dependency. Exposed on GET /metrics (see index.ts).
const httpRequests = new Map<string, number>();
const counters = new Map<string, number>();
let durationSumMs = 0;
let durationCount = 0;
let wsConnections = 0;

export function recordRequest(method: string, status: number, durationMs: number) {
  const key = `${method}|${Math.floor(status / 100)}xx`;
  httpRequests.set(key, (httpRequests.get(key) ?? 0) + 1);
  durationSumMs += durationMs;
  durationCount++;
}

export function incr(name: string, labels: Record<string, string> = {}) {
  const key = `${name}${Object.keys(labels).length ? "{" + Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(",") + "}" : ""}`;
  counters.set(key, (counters.get(key) ?? 0) + 1);
}

export function setWsConnections(n: number) {
  wsConnections = n;
}

export function renderMetrics(): string {
  const lines: string[] = [];
  lines.push("# TYPE http_requests_total counter");
  Array.from(httpRequests.entries()).forEach(([k, v]) => {
    const [method, cls] = k.split("|");
    lines.push(`http_requests_total{method="${method}",status="${cls}"} ${v}`);
  });
  lines.push("# TYPE http_request_duration_ms_sum counter", `http_request_duration_ms_sum ${durationSumMs.toFixed(1)}`);
  lines.push("# TYPE http_request_duration_ms_count counter", `http_request_duration_ms_count ${durationCount}`);
  lines.push("# TYPE ws_connections gauge", `ws_connections ${wsConnections}`);
  Array.from(counters.entries()).forEach(([k, v]) => lines.push(`${k} ${v}`));
  const mem = process.memoryUsage();
  lines.push("# TYPE process_resident_memory_bytes gauge", `process_resident_memory_bytes ${mem.rss}`);
  lines.push("# TYPE process_uptime_seconds gauge", `process_uptime_seconds ${Math.round(process.uptime())}`);
  return lines.join("\n") + "\n";
}

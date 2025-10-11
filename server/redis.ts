import Redis from "ioredis";

// For development, use in-memory fallback if Redis not available
class InMemoryRedis {
  private store = new Map<string, { value: string; expiry?: number }>();

  async set(key: string, value: string, mode?: string, duration?: number): Promise<string> {
    const expiry = mode === "EX" && duration ? Date.now() + duration * 1000 : undefined;
    this.store.set(key, { value, expiry });
    return "OK";
  }

  async setnx(key: string, value: string): Promise<number> {
    if (this.store.has(key)) {
      return 0;
    }
    this.store.set(key, { value });
    return 1;
  }

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiry && Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) count++;
    }
    return count;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const item = this.store.get(key);
    if (!item) return 0;
    item.expiry = Date.now() + seconds * 1000;
    return 1;
  }
}

// Export a mutable redis instance so we can fallback safely if connection fails
export let redis: any;

function createInMemory() {
  return new InMemoryRedis() as any;
}

if (process.env.REDIS_URL) {
  try {
    const client = new Redis(process.env.REDIS_URL, {
      // avoid aggressive reconnection loops in dev when Redis isn't running
      enableOfflineQueue: false,
      retryStrategy: () => null as any,
    });

    // if Redis emits an error (connection refused), fallback to in-memory and log once
    const onError = (err: any) => {
      console.error("[redis] connection error, falling back to in-memory Redis:", err && err.message ? err.message : err);
      try {
        client.disconnect();
      } catch (_e) {
        // ignore
      }
      redis = createInMemory();
    };

    client.once("error", onError);

    // assign the client for normal usage; if it errors, the handler will replace `redis`
    redis = client as any;
  } catch (e) {
    console.error("[redis] failed to construct ioredis client, using in-memory fallback", e);
    redis = createInMemory();
  }
} else {
  redis = createInMemory();
}

// Client-side GPS fleet simulator. Generates smooth tracks across a virtual
// metro region, and pretends to push them through ingest -> kafka -> flink ->
// redis -> websocket. All "stages" are simulated for UX demonstration only.

export type TruckStatus = "moving" | "idle" | "stale";

export interface TruckTick {
  id: string;
  lat: number;
  lng: number;
  speed: number; // km/h
  heading: number; // degrees, 0 = north
  ts: number; // ms epoch
  // simulated per-stage latencies (ms)
  stageLatency: { ingest: number; kafka: number; flink: number; redis: number; ws: number };
}

export interface TruckState {
  id: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  lastTs: number;
  status: TruckStatus;
  trail: { lat: number; lng: number; ts: number }[];
  speedHistory: { ts: number; speed: number }[];
  lastTick?: TruckTick;
}

// Bounding box ~ greater Chicago
export const BBOX = { minLat: 41.62, maxLat: 42.05, minLng: -87.94, maxLng: -87.5 };

const TRAIL_MS = 30_000;
const SPEED_HISTORY_MS = 60_000;

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function newTruck(i: number): TruckState {
  const id = `TRK-${String(i + 1).padStart(4, "0")}`;
  return {
    id,
    lat: rand(BBOX.minLat, BBOX.maxLat),
    lng: rand(BBOX.minLng, BBOX.maxLng),
    speed: rand(20, 80),
    heading: rand(0, 360),
    lastTs: Date.now(),
    status: "moving",
    trail: [],
    speedHistory: [],
  };
}

export class FleetSimulator {
  trucks: Map<string, TruckState> = new Map();
  listeners: Set<(tick: TruckTick) => void> = new Set();
  metricsListeners: Set<(m: SimMetrics) => void> = new Set();
  paused = false;
  hz = 1; // ticks per truck per second
  failedWorker = false; // backpressure demo
  private failedUntil = 0;
  private kafkaBuffer: TruckTick[] = [];
  private packetTimes: number[] = []; // for packets/sec calc
  private latencies: number[] = []; // recent end-to-end latencies
  private rafHandle: number | null = null;
  private lastTickAt = performance.now();

  constructor(public count = 50) {
    for (let i = 0; i < count; i++) {
      const t = newTruck(i);
      this.trucks.set(t.id, t);
    }
  }

  on(fn: (t: TruckTick) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  onMetrics(fn: (m: SimMetrics) => void) {
    this.metricsListeners.add(fn);
    return () => this.metricsListeners.delete(fn);
  }

  setHz(hz: number) {
    this.hz = Math.max(0.1, Math.min(hz, 20));
  }
  setPaused(p: boolean) {
    this.paused = p;
  }
  injectFailure() {
    this.failedWorker = true;
    this.failedUntil = performance.now() + 5000;
  }

  start() {
    if (this.rafHandle != null) return;
    const loop = (now: number) => {
      const dtMs = now - this.lastTickAt;
      const interval = 1000 / this.hz;
      if (!this.paused && dtMs >= interval) {
        this.lastTickAt = now;
        this.tickAll(dtMs / 1000);
      }
      // process kafka buffer (simulated drain)
      if (this.failedWorker && performance.now() > this.failedUntil) {
        this.failedWorker = false;
      }
      if (!this.failedWorker && this.kafkaBuffer.length > 0) {
        // drain up to 200 per frame
        const drain = this.kafkaBuffer.splice(0, 200);
        for (const tk of drain) this.deliver(tk);
      }
      this.emitMetrics();
      this.rafHandle = requestAnimationFrame(loop);
    };
    this.rafHandle = requestAnimationFrame(loop);
  }

  stop() {
    if (this.rafHandle != null) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = null;
  }

  private tickAll(dt: number) {
    const now = Date.now();
    for (const t of this.trucks.values()) {
      // small heading jitter, occasional turn
      t.heading += rand(-6, 6);
      if (Math.random() < 0.02) t.heading += rand(-60, 60);
      t.heading = (t.heading + 360) % 360;
      // speed drift 0-110
      t.speed += rand(-4, 4);
      if (Math.random() < 0.01) t.speed = rand(0, 110);
      t.speed = Math.max(0, Math.min(110, t.speed));

      // move (rough conversion, fine for prototype)
      const rad = (t.heading * Math.PI) / 180;
      const metersPerSec = t.speed / 3.6;
      const distM = metersPerSec * dt;
      const dLat = (Math.cos(rad) * distM) / 111_000;
      const dLng = (Math.sin(rad) * distM) / (111_000 * Math.cos((t.lat * Math.PI) / 180));
      t.lat += dLat;
      t.lng += dLng;

      // bounce at bbox
      if (t.lat < BBOX.minLat || t.lat > BBOX.maxLat) {
        t.lat = Math.max(BBOX.minLat, Math.min(BBOX.maxLat, t.lat));
        t.heading = (180 - t.heading + 360) % 360;
      }
      if (t.lng < BBOX.minLng || t.lng > BBOX.maxLng) {
        t.lng = Math.max(BBOX.minLng, Math.min(BBOX.maxLng, t.lng));
        t.heading = (360 - t.heading) % 360;
      }

      t.status = t.speed < 2 ? "idle" : "moving";

      const tick: TruckTick = {
        id: t.id,
        lat: t.lat,
        lng: t.lng,
        speed: t.speed,
        heading: t.heading,
        ts: now,
        stageLatency: {
          ingest: 1 + Math.random() * 3,
          kafka: 2 + Math.random() * 6,
          flink: 3 + Math.random() * 8,
          redis: 0.5 + Math.random() * 2,
          ws: 5 + Math.random() * 25,
        },
      };

      // send through pipeline
      if (this.failedWorker) {
        // backpressure: kafka buffers
        this.kafkaBuffer.push(tick);
      } else {
        this.deliver(tick);
      }
    }
  }

  private deliver(tick: TruckTick) {
    const t = this.trucks.get(tick.id);
    if (!t) return;
    t.lastTs = tick.ts;
    t.lastTick = tick;
    t.trail.push({ lat: tick.lat, lng: tick.lng, ts: tick.ts });
    const cutoff = tick.ts - TRAIL_MS;
    while (t.trail.length > 0 && t.trail[0].ts < cutoff) t.trail.shift();
    t.speedHistory.push({ ts: tick.ts, speed: tick.speed });
    const sCut = tick.ts - SPEED_HISTORY_MS;
    while (t.speedHistory.length > 0 && t.speedHistory[0].ts < sCut) t.speedHistory.shift();

    const totalLat =
      tick.stageLatency.ingest +
      tick.stageLatency.kafka +
      tick.stageLatency.flink +
      tick.stageLatency.redis +
      tick.stageLatency.ws;
    this.latencies.push(totalLat);
    if (this.latencies.length > 200) this.latencies.shift();

    const now = performance.now();
    this.packetTimes.push(now);
    // keep last 1s
    while (this.packetTimes.length && now - this.packetTimes[0] > 1000) this.packetTimes.shift();

    for (const fn of this.listeners) fn(tick);
  }

  private emitMetrics() {
    const now = performance.now();
    while (this.packetTimes.length && now - this.packetTimes[0] > 1000) this.packetTimes.shift();
    const pps = this.packetTimes.length;
    const avgLat =
      this.latencies.length === 0
        ? 0
        : this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
    const stale = Array.from(this.trucks.values()).filter((t) => Date.now() - t.lastTs > 5000).length;
    const m: SimMetrics = {
      pps,
      avgLatencyMs: avgLat,
      kafkaLag: this.kafkaBuffer.length,
      online: this.trucks.size - stale,
      total: this.trucks.size,
      failed: this.failedWorker,
      paused: this.paused,
    };
    for (const fn of this.metricsListeners) fn(m);
  }
}

export interface SimMetrics {
  pps: number;
  avgLatencyMs: number;
  kafkaLag: number;
  online: number;
  total: number;
  failed: boolean;
  paused: boolean;
}

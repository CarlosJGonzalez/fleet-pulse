import { useEffect, useMemo, useRef, useState } from "react";
import { FleetSimulator, type TruckState, type TruckTick, type SimMetrics, BBOX } from "@/lib/simulator";

const PIPELINE = ["INGEST", "KAFKA", "FLINK", "REDIS", "WS"] as const;

function fmt(n: number, d = 0) {
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function ageStr(ts: number) {
  const a = Math.max(0, Date.now() - ts);
  if (a < 1000) return `${a}ms`;
  if (a < 60_000) return `${(a / 1000).toFixed(1)}s`;
  return `${Math.floor(a / 60_000)}m`;
}

const Index = () => {
  const simRef = useRef<FleetSimulator | null>(null);
  const [, force] = useState(0);
  const [metrics, setMetrics] = useState<SimMetrics>({
    pps: 0, avgLatencyMs: 0, kafkaLag: 0, online: 0, total: 0, failed: false, paused: false,
  });
  const [selectedId, setSelectedId] = useState<string>("TRK-0001");
  const [hz, setHz] = useState(1);
  const [pulseStage, setPulseStage] = useState<number>(-1);
  const [mapSize, setMapSize] = useState({ w: 800, h: 600 });
  const mapRef = useRef<HTMLDivElement | null>(null);

  // init sim
  useEffect(() => {
    const sim = new FleetSimulator(50);
    simRef.current = sim;
    sim.start();
    const offTick = sim.on(() => {});
    const offM = sim.onMetrics(setMetrics);
    // re-render at 12 fps for UI panels
    const id = window.setInterval(() => force((x) => x + 1), 80);
    // pipeline pulse
    const pulseId = window.setInterval(() => {
      setPulseStage((s) => (s + 1) % PIPELINE.length);
    }, 220);
    return () => {
      sim.stop();
      offTick();
      offM();
      clearInterval(id);
      clearInterval(pulseId);
    };
  }, []);

  // map size observer
  useEffect(() => {
    if (!mapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setMapSize({ w: r.width, h: r.height });
    });
    ro.observe(mapRef.current);
    return () => ro.disconnect();
  }, []);

  const sim = simRef.current;
  const trucks: TruckState[] = sim ? Array.from(sim.trucks.values()) : [];
  const selected = sim?.trucks.get(selectedId);

  const project = useMemo(() => {
    const w = mapSize.w, h = mapSize.h;
    const lngSpan = BBOX.maxLng - BBOX.minLng;
    const latSpan = BBOX.maxLat - BBOX.minLat;
    return (lat: number, lng: number) => {
      const x = ((lng - BBOX.minLng) / lngSpan) * w;
      const y = h - ((lat - BBOX.minLat) / latSpan) * h;
      return { x, y };
    };
  }, [mapSize]);

  // status dot color
  const wsStatus = metrics.failed ? "red" : metrics.paused ? "amber" : "green";

  return (
    <div className="h-screen w-screen flex flex-col text-foreground overflow-hidden">
      {/* TOP BAR */}
      <header className="flex items-center justify-between border-b border-border px-4 py-2 bg-surface/60 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="font-display text-primary text-glow text-sm tracking-widest">
            FLEET-OPS // GPS INGEST <span className="text-muted-foreground">v0.1</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            REGION: CHI-METRO · BBOX {BBOX.minLat.toFixed(2)},{BBOX.minLng.toFixed(2)} → {BBOX.maxLat.toFixed(2)},{BBOX.maxLng.toFixed(2)}
          </div>
        </div>
        <div className="flex items-center gap-5 text-[11px]">
          <Stat label="TRUCKS" value={`${metrics.online}/${metrics.total}`} />
          <Stat label="PKT/S" value={fmt(metrics.pps)} accent />
          <Stat label="LAT μ" value={`${fmt(metrics.avgLatencyMs, 1)}ms`} />
          <Stat label="KAFKA LAG" value={fmt(metrics.kafkaLag)} warn={metrics.kafkaLag > 0} />
          <div className="flex items-center gap-2">
            <span
              className="pulse-dot inline-block h-2 w-2 rounded-full"
              style={{
                backgroundColor:
                  wsStatus === "green"
                    ? "hsl(var(--accent-green))"
                    : wsStatus === "amber"
                    ? "hsl(var(--accent-amber))"
                    : "hsl(var(--accent-red))",
              }}
            />
            <span className="font-display text-[10px] tracking-widest text-muted-foreground">
              WS {metrics.failed ? "DEGRADED" : metrics.paused ? "PAUSED" : "OK"}
            </span>
          </div>
        </div>
      </header>

      {/* CONTROL STRIP */}
      <div className="flex items-center gap-4 border-b border-border bg-background/80 px-4 py-1.5 text-[10px]">
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground tracking-widest">TICK RATE</span>
          <input
            type="range"
            min={0.5}
            max={20}
            step={0.5}
            value={hz}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setHz(v);
              sim?.setHz(v);
            }}
            className="w-40 accent-[hsl(var(--primary))]"
          />
          <span className="text-primary font-display w-28">
            {hz.toFixed(1)} Hz · ~{fmt(hz * (sim?.trucks.size ?? 0))} pkt/s
          </span>
        </label>
        <button
          onClick={() => sim && sim.setPaused(!metrics.paused)}
          className="border border-border px-2 py-0.5 hover:border-primary hover:text-primary tracking-widest"
        >
          {metrics.paused ? "▶ RESUME" : "❚❚ PAUSE"}
        </button>
        <button
          onClick={() => sim?.injectFailure()}
          className="border px-2 py-0.5 tracking-widest border-[hsl(var(--accent-red))]/50 text-[hsl(var(--accent-red))] hover:bg-[hsl(var(--accent-red))]/10"
        >
          ⚠ INJECT WORKER FAILURE (5s)
        </button>
        <div className="ml-auto text-muted-foreground">
          [click any truck to focus telemetry]
        </div>
      </div>

      {/* MAIN GRID */}
      <main className="flex flex-1 min-h-0">
        {/* LEFT — ROSTER */}
        <aside className="w-[280px] border-r border-border bg-surface/40 flex flex-col">
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <span className="font-display text-[10px] tracking-widest text-muted-foreground">
              TRUCK ROSTER · {trucks.length}
            </span>
            <span className="text-[10px] text-primary font-display">LIVE</span>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {trucks.map((t) => {
              const sel = t.id === selectedId;
              const age = Date.now() - t.lastTs;
              const stale = age > 5000;
              const status: "moving" | "idle" | "stale" = stale ? "stale" : t.status;
              const color =
                status === "moving"
                  ? "hsl(var(--accent-green))"
                  : status === "idle"
                  ? "hsl(var(--accent-amber))"
                  : "hsl(var(--accent-red))";
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left px-3 py-1.5 border-b border-border/50 flex items-center gap-2 text-[11px] hover:bg-primary/5 ${
                    sel ? "bg-primary/10 border-l-2 border-l-primary" : ""
                  }`}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-display text-foreground">{t.id}</span>
                  <span className="ml-auto text-muted-foreground">
                    {fmt(t.speed, 0)} <span className="text-[9px]">km/h</span>
                  </span>
                  <span className="text-muted-foreground/60 w-10 text-right text-[10px]">
                    {ageStr(t.lastTs)}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* CENTER — MAP */}
        <section className="flex-1 relative blueprint-panel overflow-hidden">
          <div ref={mapRef} className="absolute inset-0 corner-ticks">
            <svg width={mapSize.w} height={mapSize.h} className="block">
              {/* coordinate gridlines */}
              <g stroke="hsl(var(--grid-line) / 0.18)" strokeWidth={0.5}>
                {Array.from({ length: 11 }).map((_, i) => {
                  const x = (mapSize.w / 10) * i;
                  return <line key={`vx${i}`} x1={x} y1={0} x2={x} y2={mapSize.h} />;
                })}
                {Array.from({ length: 9 }).map((_, i) => {
                  const y = (mapSize.h / 8) * i;
                  return <line key={`hy${i}`} x1={0} y1={y} x2={mapSize.w} y2={y} />;
                })}
              </g>
              {/* axis labels */}
              <g fill="hsl(var(--muted-foreground))" fontSize="9" fontFamily="JetBrains Mono">
                {Array.from({ length: 6 }).map((_, i) => {
                  const t = i / 5;
                  const lng = BBOX.minLng + t * (BBOX.maxLng - BBOX.minLng);
                  return (
                    <text key={`xl${i}`} x={t * mapSize.w + 4} y={mapSize.h - 6} opacity={0.6}>
                      {lng.toFixed(2)}
                    </text>
                  );
                })}
                {Array.from({ length: 5 }).map((_, i) => {
                  const t = i / 4;
                  const lat = BBOX.maxLat - t * (BBOX.maxLat - BBOX.minLat);
                  return (
                    <text key={`yl${i}`} x={6} y={t * mapSize.h + 12} opacity={0.6}>
                      {lat.toFixed(2)}
                    </text>
                  );
                })}
              </g>

              {/* trails */}
              {trucks.map((t) => {
                if (t.trail.length < 2) return null;
                const isSel = t.id === selectedId;
                const pts = t.trail
                  .map((p) => {
                    const { x, y } = project(p.lat, p.lng);
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  })
                  .join(" ");
                return (
                  <polyline
                    key={`tr-${t.id}`}
                    points={pts}
                    fill="none"
                    stroke={isSel ? "hsl(var(--accent-amber))" : "hsl(var(--primary) / 0.35)"}
                    strokeWidth={isSel ? 1.5 : 0.6}
                    opacity={isSel ? 0.95 : 0.55}
                  />
                );
              })}

              {/* trucks */}
              {trucks.map((t) => {
                const { x, y } = project(t.lat, t.lng);
                const isSel = t.id === selectedId;
                const stale = Date.now() - t.lastTs > 5000;
                const fill = stale
                  ? "hsl(var(--accent-red))"
                  : isSel
                  ? "hsl(var(--accent-amber))"
                  : "hsl(var(--primary))";
                return (
                  <g
                    key={t.id}
                    transform={`translate(${x},${y}) rotate(${t.heading})`}
                    onClick={() => setSelectedId(t.id)}
                    style={{ cursor: "pointer" }}
                  >
                    {isSel && (
                      <circle r={12} fill="none" stroke="hsl(var(--accent-amber))" strokeWidth={0.8} opacity={0.7} />
                    )}
                    <polygon
                      points="0,-6 4,5 0,3 -4,5"
                      fill={fill}
                      stroke="hsl(var(--background))"
                      strokeWidth={0.5}
                    />
                  </g>
                );
              })}

              {/* selected label */}
              {selected && (() => {
                const { x, y } = project(selected.lat, selected.lng);
                return (
                  <g transform={`translate(${x + 10},${y - 10})`} fontFamily="JetBrains Mono" fontSize="10">
                    <rect x={-2} y={-10} width={120} height={36} fill="hsl(var(--surface) / 0.85)" stroke="hsl(var(--accent-amber))" strokeWidth={0.6} />
                    <text x={2} y={0} fill="hsl(var(--accent-amber))">{selected.id}</text>
                    <text x={2} y={11} fill="hsl(var(--foreground))">{selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}</text>
                    <text x={2} y={22} fill="hsl(var(--muted-foreground))">{fmt(selected.speed,0)}km/h · {fmt(selected.heading,0)}°</text>
                  </g>
                );
              })()}
            </svg>

            {/* HUD overlay */}
            <div className="absolute top-2 left-2 font-display text-[10px] text-primary/80 tracking-widest pointer-events-none">
              ◉ MAP-01 · BLUEPRINT MODE
            </div>
            <div className="absolute top-2 right-2 font-display text-[10px] text-muted-foreground tracking-widest pointer-events-none">
              FRAME {mapSize.w.toFixed(0)}×{mapSize.h.toFixed(0)}
            </div>
          </div>
        </section>

        {/* RIGHT — TELEMETRY */}
        <aside className="w-[320px] border-l border-border bg-surface/40 flex flex-col">
          <div className="border-b border-border px-3 py-1.5">
            <span className="font-display text-[10px] tracking-widest text-muted-foreground">
              TELEMETRY · {selected?.id ?? "—"}
            </span>
          </div>

          {/* detail card */}
          <div className="p-3 border-b border-border space-y-2">
            {selected ? (
              <>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <KV label="LAT" value={selected.lat.toFixed(5)} />
                  <KV label="LNG" value={selected.lng.toFixed(5)} />
                  <KV label="SPEED" value={`${fmt(selected.speed, 1)} km/h`} accent />
                  <KV label="HDG" value={`${fmt(selected.heading, 0)}°`} />
                  <KV label="LAST" value={ageStr(selected.lastTs)} />
                  <KV label="STATUS" value={selected.status.toUpperCase()} />
                </div>

                {/* sparkline */}
                <div>
                  <div className="flex items-center justify-between text-[9px] tracking-widest text-muted-foreground mb-1">
                    <span>SPEED · 60s WINDOW (FLINK)</span>
                    <span>0–110 km/h</span>
                  </div>
                  <Sparkline data={selected.speedHistory} />
                </div>
              </>
            ) : (
              <div className="text-[11px] text-muted-foreground">no selection</div>
            )}
          </div>

          {/* raw packet */}
          <div className="p-3 border-b border-border">
            <div className="text-[9px] tracking-widest text-muted-foreground mb-1">
              ◉ LAST PACKET · PROTOBUF→JSON
            </div>
            <pre className="text-[10px] leading-tight bg-background/60 border border-border p-2 overflow-x-auto text-primary/90">
{JSON.stringify(selected?.lastTick ?? {}, null, 2)}
            </pre>
          </div>

          {/* pipeline */}
          <div className="mt-auto p-3 border-t border-border">
            <div className="text-[9px] tracking-widest text-muted-foreground mb-2">
              PIPELINE · END-TO-END {fmt(metrics.avgLatencyMs, 1)}ms
            </div>
            <div className="flex items-center justify-between">
              {PIPELINE.map((stage, i) => {
                const lat =
                  selected?.lastTick?.stageLatency[
                    ["ingest", "kafka", "flink", "redis", "ws"][i] as keyof TruckTick["stageLatency"]
                  ] ?? 0;
                const active = pulseStage === i;
                const isKafka = stage === "KAFKA";
                const lagged = isKafka && metrics.kafkaLag > 0;
                return (
                  <div key={stage} className="flex items-center">
                    <div className="flex flex-col items-center">
                      <div
                        className={`h-7 w-12 border flex items-center justify-center text-[9px] tracking-widest ${
                          lagged
                            ? "border-[hsl(var(--accent-red))] text-[hsl(var(--accent-red))]"
                            : active
                            ? "border-primary text-primary text-glow"
                            : "border-border text-muted-foreground"
                        }`}
                        style={active ? { boxShadow: "0 0 8px hsl(var(--primary)/0.5)" } : {}}
                      >
                        {stage}
                      </div>
                      <div className="text-[9px] mt-0.5 text-muted-foreground">
                        {lagged ? `+${metrics.kafkaLag}` : `${lat.toFixed(1)}ms`}
                      </div>
                    </div>
                    {i < PIPELINE.length - 1 && (
                      <div
                        className={`h-px w-4 mx-0.5 ${
                          pulseStage === i ? "bg-primary flow-pulse" : "bg-border"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 text-[9px] text-muted-foreground/70 leading-tight">
              MQTT/gRPC → NLB → Kafka (part. by truck_id) → Flink windowing → Redis (latest) → WS push
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
};

function Stat({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-[9px] tracking-widest text-muted-foreground">{label}</span>
      <span
        className={`font-display ${
          warn ? "text-[hsl(var(--accent-red))]" : accent ? "text-primary text-glow" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function KV({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col border border-border/60 px-2 py-1 bg-background/40">
      <span className="text-[9px] tracking-widest text-muted-foreground">{label}</span>
      <span className={`font-display text-[11px] ${accent ? "text-primary text-glow" : ""}`}>{value}</span>
    </div>
  );
}

function Sparkline({ data }: { data: { ts: number; speed: number }[] }) {
  const W = 280;
  const H = 48;
  if (data.length < 2) {
    return <div className="h-12 border border-border/60 bg-background/40" />;
  }
  const t0 = data[0].ts;
  const t1 = data[data.length - 1].ts;
  const span = Math.max(1, t1 - t0);
  const max = 110;
  const pts = data
    .map((d) => {
      const x = ((d.ts - t0) / span) * W;
      const y = H - (d.speed / max) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="border border-border/60 bg-background/40">
      <g stroke="hsl(var(--grid-line) / 0.15)" strokeWidth={0.5}>
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <line key={p} x1={0} y1={H * p} x2={W} y2={H * p} />
        ))}
      </g>
      <polyline
        points={pts}
        fill="none"
        stroke="hsl(var(--accent-amber))"
        strokeWidth={1}
      />
    </svg>
  );
}

export default Index;

import { Button } from "@/components/ui/button";

const sections = [
  {
    title: "API design",
    badge: "EDGE CONTRACT",
    points: [
      "MQTT or gRPC handles device ingress; WebSocket fans out browser updates with one normalized event contract.",
      "Protocol Buffers keep packets compact and schema-versioned while preserving strong typing across services.",
      "Idempotency keys plus ordering by truck_id prevent duplicate writes and keep per-vehicle movement consistent.",
    ],
  },
  {
    title: "Data ingestion",
    badge: "HOT PATH",
    points: [
      "A layer-4 load balancer spreads sessions across stateless ingress workers so devices never pin to one node.",
      "Ingress validates payload shape, normalizes coordinates and timestamps, and publishes directly to Kafka partitions.",
      "Malformed or delayed packets route to a dead-letter topic instead of blocking the real-time stream.",
    ],
  },
  {
    title: "Database & storage",
    badge: "STATE MODEL",
    points: [
      "Redis stores the latest known position and recent derived state for sub-second reads and map refreshes.",
      "A time-series database stores full telemetry history for replay, compliance, SLA forensics, and trend queries.",
      "Cold object storage is optional for long-retention analytics, offline ML feature generation, and reprocessing.",
    ],
  },
  {
    title: "Scalability",
    badge: "CAPACITY",
    points: [
      "Scale ingress workers horizontally and increase Kafka partitions as truck count and update frequency rise.",
      "Consumer groups isolate enrichment, alerting, and persistence so one slow downstream path does not stall others.",
      "Backpressure stays in Kafka buffers; autoscaling and observability focus on lag, e2e latency, and drop rates.",
    ],
  },
  {
    title: "Real-time vs batch",
    badge: "TRADEOFFS",
    points: [
      "Streaming owns the operator loop: latest position, ETA drift, unsafe events, and dispatch-triggered actions.",
      "Batch owns heavyweight work: route efficiency studies, cost analysis, retraining, and replay after schema changes.",
      "Prioritize availability on the live path; use asynchronous recovery to restore completeness when systems degrade.",
    ],
  },
] as const;

const architectureFlow = ["MQTT/gRPC", "INGEST", "KAFKA", "FLINK", "REDIS", "WS/API"] as const;

interface DesignBriefPanelProps {
  pdfHref: string;
}

export function DesignBriefPanel({ pdfHref }: DesignBriefPanelProps) {
  return (
    <section className="flex-1 min-h-0 overflow-y-auto blueprint-panel">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
        <header className="grid gap-4 border border-border bg-surface/75 p-5 md:grid-cols-[1.4fr_0.8fr]">
          <div className="space-y-3">
            <div className="font-mono-display text-[10px] tracking-widest text-primary text-glow">
              API &amp; DATA PLATFORM BRIEF · ENGINEERING SUMMARY
            </div>
            <h1 className="font-mono-display text-2xl text-foreground">
              Real-time fleet GPS design optimized for throughput, latency, and fault isolation.
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              The recommended baseline keeps the ingest path stateless, preserves per-truck ordering through Kafka,
              serves live reads from Redis, and shifts heavy analytics to historical storage and offline compute.
            </p>
          </div>

          <div className="flex flex-col justify-between gap-4 border border-border bg-background/40 p-4">
            <div>
              <div className="text-[10px] tracking-widest text-muted-foreground">RECOMMENDED BASELINE STACK</div>
              <div className="mt-2 text-sm leading-6 text-foreground">
                MQTT/gRPC ingress · Kafka partitions by truck_id · Flink/windowed processing · Redis hot state · TSDB
                history · WebSocket delivery
              </div>
            </div>
            <Button asChild size="sm" className="self-start font-mono-display tracking-widest">
              <a href={pdfHref} download>
                ↓ DOWNLOAD PDF
              </a>
            </Button>
          </div>
        </header>

        <div className="grid gap-3 border border-border bg-surface/60 p-4 md:grid-cols-6">
          {architectureFlow.map((stage, index) => (
            <div key={stage} className="flex items-center gap-3 md:contents">
              <div className="flex min-h-14 items-center justify-center border border-border bg-background/40 px-3 py-2 text-center font-mono-display text-[11px] tracking-widest text-foreground md:col-span-1">
                {stage}
              </div>
              {index < architectureFlow.length - 1 && (
                <div className="hidden h-px bg-border md:col-span-1 md:block md:self-center" />
              )}
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr]">
          {sections.map((section, index) => (
            <article
              key={section.title}
              className={`border border-border bg-surface/65 p-4 ${index === sections.length - 1 ? "lg:col-span-2 xl:col-span-1" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono-display text-[10px] tracking-widest text-primary/80">{section.badge}</div>
                  <h2 className="mt-1 font-mono-display text-lg text-foreground">{section.title}</h2>
                </div>
                <div className="mt-1 h-2 w-2 rounded-full bg-primary pulse-dot" />
              </div>

              <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                {section.points.map((point) => (
                  <li key={point} className="flex gap-3">
                    <span className="pt-2 text-primary">—</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
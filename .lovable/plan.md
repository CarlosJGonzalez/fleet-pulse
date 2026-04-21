
# Real-Time Fleet GPS Tracking — Interactive Prototype

A single-page dashboard that simulates the user-facing output of the architecture you described: thousands of GPS packets/sec flowing through ingestion → Kafka → Flink → Redis → WebSocket → browser. Since this is a frontend prototype, the "stream" is generated client-side, but the UI behaves exactly as if a real WebSocket were pushing Protobuf-decoded coordinates.

## Visual style — Technical / Blueprint
- Dark navy canvas with a faint blueprint grid background
- Cyan/amber accent lines, monospace labels (JetBrains Mono / IBM Plex Mono)
- Thin 1px strokes, crosshair markers, schematic-style truck icons
- Map rendered with a dark blueprint tile style (CartoDB dark-matter or a custom muted basemap)

## Layout (single screen, 1458×887 optimized)

**Top bar**
- System name "FLEET-OPS // GPS INGEST v0.1"
- Live counters: trucks online, packets/sec, avg end-to-end latency (ms), WS status indicator (pulsing dot)

**Left rail — Truck roster (~280px)**
- Scrollable list of ~50 simulated trucks (TRK-0001 … TRK-0050)
- Each row: ID, current speed, last-update age, status chip (moving / idle / stale)
- Click to focus that truck on the map

**Center — Live map (flex)**
- Blueprint-styled map covering a metro region (e.g. greater Chicago bbox)
- Trucks rendered as rotated triangle/arrow markers, heading-aware
- Smooth interpolated movement between GPS ticks (no teleporting)
- Trailing polyline showing last ~30s of path for each visible truck
- Selected truck: highlighted, larger trail, label with lat/lng/speed/heading

**Right rail — Telemetry (~320px)**
- Selected truck detail card: ID, coords, speed, heading, last packet timestamp
- Mini sparkline: speed over last 60s (windowed avg, mirrors the Flink "windowing" concept)
- Raw packet preview: shows the would-be Protobuf payload decoded as JSON, updating live
- Pipeline strip at bottom: Ingest → Kafka → Flink → Redis → WS, each node pulses as a packet flows through, with simulated per-stage latency in ms

## Simulation engine (client-side)
- Web Worker generates GPS ticks for all trucks at ~1 Hz each (configurable 0.5–5 Hz via a slider in top bar)
- Each truck follows a randomized smooth path (bearing + small jitter, occasional turns, speed 0–110 km/h)
- A simulated "WebSocket" event bus pushes ticks to the UI; a tiny in-memory "Redis" map holds latest position per truck
- Metrics (packets/sec, latency) are computed from real timing of the simulation loop so the numbers feel honest

## Interactions
- Tick-rate slider (simulate load: 50 → 5,000 packets/sec)
- "Inject failure" button: pauses one ingestion worker for 5s to demo backpressure — Kafka node visibly buffers, then drains
- Pause / resume stream
- Click any truck (map or list) to focus and pin telemetry

## Out of scope (prototype)
- No real MQTT/Kafka/Flink/Redis — all simulated in-browser to demonstrate UX
- No historical playback / TSDB view (can be added later)
- No geofence drawing (can be added later)
- No auth, no backend

## Tech
- React + Vite + Tailwind (existing stack)
- `react-leaflet` + Leaflet with a dark basemap for the blueprint map
- Web Worker for the GPS simulator so the UI stays at 60fps
- Lightweight SVG sparkline (no chart lib needed) for the speed window

After your approval I'll switch out of planning mode and build it.

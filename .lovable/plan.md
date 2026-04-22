
# Regenerate the system-design brief as both a downloadable PDF and on-page summary

## What to build
Create a new concise “API & Data Platform Brief” that complements the existing fleet prototype and focuses on:
- API design
- Data ingestion approach
- Database/storage decisions
- Scalability considerations
- Real-time vs batch tradeoffs

The deliverable will be:
1. A new 1-page downloadable PDF brief for engineer readers
2. A matching brief panel/page inside the app so the content is visible without opening the PDF

## Implementation plan

### 1) Add the new brief content
Write a tighter, engineer-oriented brief with five sections:
- API design: MQTT/gRPC for device ingress, WebSocket for client fan-out, Protobuf schema, idempotency keys, ordering by `truck_id`
- Data ingestion: L4 load balancer, stateless ingestion workers, Kafka partitioning, validation/normalization, dead-letter handling
- Storage decisions: Redis for latest position, TSDB for historical telemetry, optional object storage/data lake for cold analytics
- Scalability: horizontal worker scaling, Kafka partition strategy, consumer groups, backpressure handling, failure isolation, observability
- Real-time vs batch: what belongs in sub-second streaming paths vs offline analytics/reprocessing

Keep it brief, structured, and decision-focused rather than tutorial-style.

### 2) Generate a new downloadable PDF artifact
Produce a fresh versioned PDF, for example:
`Fleet_GPS_API_Design_Brief_v2.pdf`

The PDF should:
- Fit on one page
- Use the project’s existing technical/blueprint visual language
- Include a title, short objective statement, architecture flow line, and the five decision sections
- End with a compact “recommended baseline stack” summary

### 3) Add the same brief into the app
Surface the brief in the React app so it is readable in-preview:
- Add a dedicated brief view or right-side panel accessible from the main dashboard
- Include the same five sections with concise bullets
- Add a clear download link/button for the generated PDF
- Preserve the current fleet dashboard as the main experience

A simple pattern that fits the current app:
```text
Top bar actions
[ Dashboard ] [ Design Brief ] [ Download PDF ]
```

### 4) Match the current visual system
Follow the existing blueprint styling already present in the project:
- dark navy background
- cyan/amber accents
- monospace typography
- thin borders, grid background, technical labels

The brief UI should feel like an extension of the existing control-room dashboard, not a separate product.

### 5) QA and verification
Before delivery:
- Verify the on-page brief is readable at the current viewport
- Confirm the PDF link is wired correctly
- Generate and visually inspect every PDF page as images
- Check for overflow, clipping, poor contrast, bad wrapping, and unsupported glyphs
- If issues appear, iterate and regenerate a new versioned PDF rather than overwriting the previous file

## Files likely to change
- `src/pages/Index.tsx` — add brief access and on-page content
- `src/App.tsx` — only if a separate route is used
- `src/index.css` — minor styling support if needed
- `/mnt/documents/Fleet_GPS_API_Design_Brief_v2.pdf` — new downloadable artifact

## Technical details
- The app already has a single-route dashboard structure, so the fastest path is adding a toggle/view state inside `Index.tsx`
- The existing design tokens in `src/index.css` can be reused for the brief
- The PDF should be generated as a separate versioned artifact and linked from the UI
- The brief content should stay aligned with the current simulated architecture: ingestion → Kafka → Flink/windowing → Redis/latest state → WebSocket delivery, with TSDB/history described as the analytical path

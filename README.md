# ResolveIQ

**Autonomous where it's safe. Human where it matters.** ResolveIQ is a support operations console for complex cases that need investigation across orders, shipping, inventory, policy, and warehouse systems. It is deliberately not a chatbot: actions are gated by deterministic evidence and policy checks.

## Architecture

`React dashboard → Express API → Classifier → adaptive Orchestrator → mock business tools + policy retrieval → Safety Gate → action or escalation`

- **Classifier** identifies category, entities, required systems, possible actions, and risk.
- **Orchestrator** adapts its route: the delivery case detects an address conflict then adds policy and inventory investigation.
- **RAG / policy layer** retrieves metadata-bearing policy documents with relevance scores.
- **Safety Gate** deterministically checks completeness, consistency, policy, risk, and confidence before action.
- **Human approval** contains the full investigation context; approval is the only route to executing the pending high-risk cancellation.

## Demo cases

1. `ORD-1001`: delivered record + address mismatch + stock + delivery policy → 96%, autonomous replacement and warehouse notification.
2. `ORD-2001`: ₹80,000 order already shipped + cancellation policy → 61%, human escalation. Cancellation is never automatically executed.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The API runs at port 4000. Copy `.env.example` to `.env` to configure port, MongoDB URI, or an optional LLM provider. The current hackathon runtime deliberately defaults to deterministic in-memory seeded data so the demo is reliable without external services. The data layer is organized as collections and can be replaced by Mongoose repositories using `MONGODB_URI` without changing the agent pipeline.

```bash
npm run seed
npm test
```

## API

- `GET /api/dashboard`, `/api/tickets`, `/api/tickets/:id`, `/api/tickets/:id/timeline`
- `POST /api/resolve/demo` body `{ "demo": "demo1" | "demo2" }`
- `POST /api/tickets/:id/resolve`
- `GET /api/escalations`, `POST /api/escalations/:id/approve`, `/reject`
- `GET /api/audit-logs`, `/api/policies`

## Audit and safeguards

Each classification, tool invocation, policy retrieval, safety decision, action, and human decision writes an audit event with a resolution id. Irreversible actions are forbidden unless the Safety Gate returns `AUTO_EXECUTE`; high-value shipped cancellation is always escalation-bound.

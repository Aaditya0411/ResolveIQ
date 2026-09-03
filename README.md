# ResolveIQ

**Autonomous where it's safe. Human where it matters.**

🌐 **Live Demo Application**: [https://resolveiq-nrt3.onrender.com/](https://resolveiq-nrt3.onrender.com/)

ResolveIQ is an AI-powered support operations console designed for complex e-commerce cases that require cross-system investigation across orders, shipping, inventory, policy KB, and warehouse systems. Actions are strictly gated by deterministic evidence verification and policy rules.

---

## 🚀 System Architecture

```text
React Dashboard → Express API → Classifier Agent → Adaptive Orchestrator → Mock Business Tools + Policy RAG → Safety Gate → Autonomous Action / Human Escalation
```

- **Classifier Agent**: Identifies intent category (`delivery_dispute`, `cancellation_request`, `refund_request`, `damaged_item`, `shipping_delay`, `unknown`), entities, required systems, potential actions, and risk level. Supports optional LLM classification with rule-based fallback.
- **Adaptive Orchestrator**: Dynamically routes investigation workflows based on category, queries shipping & customer records, verifies inventory, and retrieves matching policy rules.
- **Policy RAG Layer**: Searches policy database using keyword matching and relevance scoring across tags, section titles, and rule content.
- **Safety Gate**: Deterministically checks evidence completeness, policy requirements, consistency, order value risk, and confidence score before allowing autonomous execution.
- **Human Escalation Console**: Blocks irreversible actions (e.g. high-value cancellations or low confidence requests) and presents human support agents with full investigation audit trails and one-click decision controls.

---

## 🛠️ Features & Endpoints

### API Endpoints

- **Live Service URL**: `https://resolveiq-nrt3.onrender.com`
- **Health Check**: `GET /api/health`
- **Dashboard Data**: `GET /api/dashboard` (returns active tickets, runs, escalations, audit logs, policies, and metrics)
- **Tickets**: 
  - `GET /api/tickets`
  - `POST /api/tickets` (Create custom support ticket)
  - `GET /api/tickets/:id`
  - `POST /api/tickets/:id/resolve` (Trigger automated resolution pipeline)
  - `GET /api/tickets/:id/timeline`
- **Demo Resolutions**: `POST /api/resolve/demo` (Body: `{ "demo": "demo1" | "demo2" }`)
- **Escalations**:
  - `GET /api/escalations`
  - `POST /api/escalations/:id/approve` (Executes approved action: cancellation, replacement, or refund)
  - `POST /api/escalations/:id/reject`
  - `POST /api/escalations/:id/investigate`
- **Policies & Audit**:
  - `GET /api/policies`
  - `POST /api/policies` (Create custom policy rule)
  - `GET /api/audit-logs`

---

## 💻 Quick Start

### 1. Installation

Install dependencies for root, backend, and frontend:

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

### 2. Environment Setup

Create a `.env` file in `backend/.env` (or root):

```env
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/resolveiq
LLM_PROVIDER=deterministic
LLM_API_KEY=
LLM_MODEL=
```

### 3. Run Development Server

Start both backend API (`:4000`) and frontend Vite dashboard (`:5173`) concurrently:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Testing

Run backend unit test suite:

```bash
npm test
```

Test suite covers:
- RAG Policy Retrieval & Keyword Scoring
- Autonomous Delivery Dispute Resolution
- High-Value Shipped Cancellation Escalations
- Low-Confidence Action Blocking
- Custom Ticket Creation & Refund Processing
- Dynamic Escalation Tool Approvals
- Dynamic Policy Addition

---

## 🛡️ Audit & Safeguards

Every classification step, tool invocation, policy match, safety gate evaluation, autonomous action, and human decision writes a persistent, timestamped audit log entry with a unique resolution ID (`RES-...`). Irreversible actions are forbidden unless the Safety Gate returns `AUTO_EXECUTE`.

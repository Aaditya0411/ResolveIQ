import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, resetSeed, createTicket, createPolicy, initMongo } from './store.js';
import { resolveTicket, approveEscalation, rejectEscalation, investigateEscalation } from './agents/orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Initialize optional MongoDB connection asynchronously
initMongo().catch(() => {});

app.get('/api/health', (_, res) => res.json({ ok: true, mode: process.env.LLM_PROVIDER || 'deterministic' }));

app.get('/api/dashboard', (_, res) => {
  const tickets = [...db.tickets.values()];
  const runs = [...db.runs.values()];
  res.json({
    tickets,
    runs,
    escalations: [...db.escalations.values()],
    audit: db.audit,
    policies: db.policies,
    metrics: {
      activeTickets: tickets.filter((t) => t.status === 'OPEN').length,
      autonomousResolutions: runs.filter((r) => r.status === 'RESOLVED').length,
      humanEscalations: [...db.escalations.values()].filter((e) => e.status === 'PENDING').length,
      averageResolutionTime: runs.length ? '00:03' : '—'
    }
  });
});

app.get('/api/tickets', (_, res) => res.json([...db.tickets.values()]));

app.post('/api/tickets', (req, res) => {
  const { customerId, orderId, subject, message } = req.body;
  const ticket = createTicket({ customerId, orderId, subject, message });
  res.status(201).json(ticket);
});

app.get('/api/tickets/:id', (req, res) => {
  const ticket = db.tickets.get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  const run = [...db.runs.values()].filter((r) => r.ticketId === ticket.id).at(-1);
  res.json({ ticket, run, customer: db.customers.get(ticket.customerId) });
});

app.post('/api/tickets/:id/resolve', async (req, res, next) => {
  try {
    res.json(await resolveTicket(req.params.id));
  } catch (e) {
    next(e);
  }
});

app.post('/api/resolve/demo', async (req, res, next) => {
  try {
    resetSeed();
    const ticketId = req.body.demo === 'demo2' ? 'TKT-2001' : 'TKT-1001';
    res.json(await resolveTicket(ticketId));
  } catch (e) {
    next(e);
  }
});

app.get('/api/tickets/:id/timeline', (req, res) => {
  const run = [...db.runs.values()].filter((r) => r.ticketId === req.params.id).at(-1);
  res.json(run?.events || []);
});

app.get('/api/escalations', (_, res) => res.json([...db.escalations.values()]));

app.post('/api/escalations/:id/approve', (req, res, next) => {
  try {
    res.json(approveEscalation(req.params.id));
  } catch (e) {
    next(e);
  }
});

app.post('/api/escalations/:id/reject', (req, res, next) => {
  try {
    res.json(rejectEscalation(req.params.id));
  } catch (e) {
    next(e);
  }
});

app.post('/api/escalations/:id/investigate', async (req, res, next) => {
  try {
    res.json(await investigateEscalation(req.params.id));
  } catch (e) {
    next(e);
  }
});

app.get('/api/audit-logs', (_, res) => res.json(db.audit));

app.get('/api/policies', (_, res) => res.json(db.policies));

app.post('/api/policies', (req, res) => {
  const { name, section, text, tags, risk } = req.body;
  if (!name || !text) return res.status(400).json({ error: 'Name and text are required' });
  const policy = createPolicy({ name, section, text, tags, risk });
  res.status(201).json(policy);
});

// Serve static frontend in production
const distPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(distPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) next();
  });
});

app.use((err, _, res, __) => res.status(400).json({ error: err.message }));

const port = process.env.PORT || 4000;
app.listen(port, '0.0.0.0', () => console.log(`ResolveIQ API on :${port}`));

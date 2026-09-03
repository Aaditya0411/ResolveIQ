import test from 'node:test';
import assert from 'node:assert/strict';
import { resetSeed, db, createTicket, createPolicy } from '../src/store.js';
import { resolveTicket, approveEscalation } from '../src/agents/orchestrator.js';
import { safetyGate } from '../src/agents/safety.js';
import { retrievePolicy } from '../src/rag/policies.js';

test('policy retrieval returns delivery policy', () => {
  resetSeed();
  assert.equal(retrievePolicy('delivery_dispute')[0].id, 'POL-DEL-04');
});

test('delivery dispute is autonomously resolved', async () => {
  resetSeed();
  const run = await resolveTicket('TKT-1001');
  assert.equal(run.status, 'RESOLVED');
  assert.equal(run.decision.decision, 'AUTO_EXECUTE');
  assert.equal(db.tickets.get('TKT-1001').status, 'RESOLVED');
});

test('shipped high-value cancellation is escalated and never cancelled', async () => {
  resetSeed();
  const run = await resolveTicket('TKT-2001');
  assert.equal(run.status, 'ESCALATED');
  assert.equal(run.decision.decision, 'HUMAN_APPROVAL');
  assert.equal(db.orders.get('ORD-2001').status, 'SHIPPED');
});

test('low confidence cannot auto execute irreversible action', () => {
  const gate = safetyGate({ category: 'unknown', evidence: [], policies: [], proposedAction: 'CANCEL_ORDER', order: { amount: 80000 } });
  assert.equal(gate.decision, 'HUMAN_APPROVAL');
});

test('create custom ticket and resolve refund request', async () => {
  resetSeed();
  const tkt = createTicket({ customerId: 'CUST-1001', orderId: 'ORD-1001', subject: 'Refund request', message: 'I would like a refund for my order' });
  const run = await resolveTicket(tkt.id);
  assert.equal(run.classification.category, 'refund_request');
  assert.equal(run.status, 'ESCALATED');
});

test('dynamic approval executes matching proposed action', async () => {
  resetSeed();
  const run = await resolveTicket('TKT-2001');
  assert.ok(run.escalationId);
  const esc = approveEscalation(run.escalationId);
  assert.equal(esc.status, 'APPROVED');
  assert.equal(db.orders.get('ORD-2001').status, 'CANCELLED');
});

test('create dynamic policy', () => {
  resetSeed();
  const p = createPolicy({ name: 'Custom Policy', text: 'Custom refund policy text', tags: ['custom'], risk: 'low' });
  assert.equal(p.name, 'Custom Policy');
  const retrieved = retrievePolicy('custom');
  assert.equal(retrieved[0].name, 'Custom Policy');
});

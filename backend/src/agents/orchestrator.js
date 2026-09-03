import { db, audit, id } from '../store.js';
import { classifyAsync } from './classifier.js';
import { retrievePolicy } from '../rag/policies.js';
import { safetyGate } from './safety.js';
import { toolDefinitions } from '../tools/index.js';

export async function resolveTicket(ticketId) {
  const ticket = db.tickets.get(ticketId);
  if (!ticket) throw new Error('Ticket not found');

  const run = {
    id: id('RES'),
    ticketId,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    events: [],
    evidence: [],
    policies: [],
    actions: []
  };
  db.runs.set(run.id, run);

  const event = (stage, message, meta = {}) => {
    const value = { id: id('EVT'), timestamp: new Date().toISOString(), stage, message, ...meta };
    run.events.push(value);
    audit({
      resolutionId: run.id,
      ticketId,
      agent: stage,
      tool: meta.tool || '—',
      action: message,
      arguments: meta.arguments,
      result: meta.result,
      status: meta.status || 'SUCCESS'
    });
    return value;
  };

  const execute = (name, args) => {
    const result = toolDefinitions[name](args);
    event('TOOLS', `${name.replaceAll('_', ' ').toUpperCase()} completed`, { tool: name.toUpperCase(), arguments: args, result });
    return result;
  };

  event('TICKET', 'Ticket received');
  
  const classification = await classifyAsync(ticket);
  run.classification = classification;
  event('CLASSIFIER', `Classified as ${classification.category}`, { result: classification });

  const order = ticket.orderId ? execute('get_order', { orderId: ticket.orderId }) : null;
  
  if (!order) {
    run.policies = retrievePolicy(ticket.subject || ticket.message);
    run.decision = safetyGate({ category: classification.category, evidence: [], policies: run.policies, proposedAction: 'ESCALATE', order: { amount: 0 } });
    run.status = 'ESCALATED';
    event('SAFETY_GATE', `No valid order linked — ${run.decision.decision}`, { result: run.decision, status: run.decision.decision });
    return run;
  }

  if (classification.category === 'delivery_dispute') {
    const shipment = execute('get_shipping', { orderId: order.id });
    const customer = execute('get_customer', { customerId: order.customerId });
    event('EVIDENCE', `Shipping reports ${shipment?.status || 'UNKNOWN'}`);
    const mismatch = shipment && customer && shipment.deliveryAddress !== customer.address;
    run.evidence.push({ type: 'DELIVERED_STATUS', value: shipment?.status, source: 'Shipping API', consistent: true });
    run.evidence.push({ type: mismatch ? 'ADDRESS_MISMATCH' : 'ADDRESS_MATCH', value: { customer: customer?.address, delivery: shipment?.deliveryAddress }, source: 'Address verification', consistent: true });
    if (mismatch) event('EVIDENCE', 'Evidence conflict detected: delivery address differs from confirmed customer address', { status: 'WARNING' });
    event('ORCHESTRATOR', 'Strategy updated: retrieve dispute policy and validate replacement availability', { status: 'ADAPTED' });
    run.policies = retrievePolicy(classification.category);
    event('RAG', `${run.policies[0]?.name || 'No policy'} retrieved`, { tool: 'POLICY_KB', result: run.policies });
    const inventory = execute('check_inventory', { item: order.item });
    if (inventory?.available > 0) run.evidence.push({ type: 'INVENTORY_AVAILABLE', value: inventory, source: 'Inventory API', consistent: true });
  } else if (classification.category === 'cancellation_request') {
    const shipment = execute('get_shipping', { orderId: order.id });
    run.evidence.push({ type: 'ORDER_SHIPPED', value: order.status, source: 'Order API', consistent: true });
    run.evidence.push({ type: 'CARRIER_HANDOFF', value: shipment?.status, source: 'Shipping API', consistent: true });
    event('EVIDENCE', 'Policy/evidence conflict detected: shipment is active and cancellation is requested', { status: 'WARNING' });
    run.policies = retrievePolicy(classification.category);
    event('RAG', `${run.policies[0]?.name || 'No policy'} retrieved`, { tool: 'POLICY_KB', result: run.policies });
  } else if (classification.category === 'refund_request') {
    const shipment = execute('get_shipping', { orderId: order.id });
    run.evidence.push({ type: 'REFUND_REQUESTED', value: order.amount, source: 'Customer Input', consistent: true });
    run.evidence.push({ type: 'ORDER_STATUS', value: order.status, source: 'Order API', consistent: true });
    run.policies = retrievePolicy('refund_request');
    event('RAG', `${run.policies[0]?.name || 'No policy'} retrieved`, { tool: 'POLICY_KB', result: run.policies });
  } else {
    run.policies = retrievePolicy(ticket.subject || ticket.message);
    event('RAG', `${run.policies[0]?.name || 'General Policy'} retrieved`, { tool: 'POLICY_KB', result: run.policies });
  }

  let proposedAction = 'ESCALATE';
  if (classification.category === 'delivery_dispute') proposedAction = 'CREATE_REPLACEMENT';
  else if (classification.category === 'cancellation_request') proposedAction = 'CANCEL_ORDER';
  else if (classification.category === 'refund_request') proposedAction = 'PROCESS_REFUND';

  run.decision = safetyGate({ category: classification.category, evidence: run.evidence, policies: run.policies, proposedAction, order });
  event('SAFETY_GATE', `${Math.round(run.decision.confidence * 100)}% confidence — ${run.decision.decision}`, { result: run.decision, status: run.decision.decision });

  if (run.decision.decision === 'AUTO_EXECUTE') {
    if (proposedAction === 'CREATE_REPLACEMENT') {
      const reservation = execute('reserve_replacement', { item: order.item });
      const warehouse = execute('warehouse_notify', { orderId: order.id, item: order.item });
      run.actions.push({ action: 'CREATE_REPLACEMENT', reservation, warehouse });
    } else if (proposedAction === 'PROCESS_REFUND') {
      const refund = execute('process_refund', { orderId: order.id, amount: order.amount });
      run.actions.push({ action: 'PROCESS_REFUND', refund });
    } else if (proposedAction === 'CANCEL_ORDER') {
      const cancellation = execute('cancel_order', { orderId: order.id });
      run.actions.push({ action: 'CANCEL_ORDER', cancellation });
    }
    ticket.status = 'RESOLVED';
    run.status = 'RESOLVED';
    event('RESOLUTION', 'Action executed automatically per policy authorization', { status: 'RESOLVED' });
  } else {
    const escalation = {
      id: id('ESC'),
      ticketId,
      resolutionId: run.id,
      status: 'PENDING',
      proposedAction,
      createdAt: new Date().toISOString(),
      recommendation: proposedAction === 'CANCEL_ORDER' ? 'DO NOT AUTO-CANCEL' : 'REQUIRES HUMAN REVIEW',
      ...run.decision,
      classification,
      evidence: run.evidence,
      systemsChecked: classification.requiredSystems,
      toolCalls: run.events.filter((x) => x.stage === 'TOOLS')
    };
    db.escalations.set(escalation.id, escalation);
    run.escalationId = escalation.id;
    ticket.status = 'HUMAN_APPROVAL_REQUIRED';
    run.status = 'ESCALATED';
    event('RESOLUTION', 'Human approval required — no irreversible action executed', { status: 'ESCALATED' });
  }

  run.completedAt = new Date().toISOString();
  return run;
}

export function approveEscalation(escalationId) {
  const esc = db.escalations.get(escalationId);
  if (!esc) throw new Error('Escalation not found');
  if (esc.status !== 'PENDING') throw new Error('Escalation already handled');

  const ticket = db.tickets.get(esc.ticketId);
  let result;
  
  if (esc.proposedAction === 'CREATE_REPLACEMENT') {
    const order = db.orders.get(ticket.orderId);
    const reservation = toolDefinitions.reserve_replacement({ item: order.item });
    const warehouse = toolDefinitions.warehouse_notify({ orderId: order.id, item: order.item });
    result = { reservation, warehouse };
  } else if (esc.proposedAction === 'PROCESS_REFUND') {
    const order = db.orders.get(ticket.orderId);
    result = toolDefinitions.process_refund({ orderId: order.id, amount: order.amount });
  } else {
    result = toolDefinitions.cancel_order({ orderId: ticket.orderId });
  }

  esc.status = 'APPROVED';
  esc.humanDecisionAt = new Date().toISOString();
  ticket.status = 'RESOLVED_BY_HUMAN';
  
  audit({
    ticketId: esc.ticketId,
    resolutionId: esc.resolutionId,
    agent: 'HUMAN_AGENT',
    tool: 'ORDER_API',
    action: `APPROVE_${esc.proposedAction}`,
    result,
    status: 'SUCCESS'
  });
  
  return esc;
}

export function rejectEscalation(escalationId) {
  const esc = db.escalations.get(escalationId);
  if (!esc) throw new Error('Escalation not found');
  esc.status = 'REJECTED';
  audit({ ticketId: esc.ticketId, resolutionId: esc.resolutionId, agent: 'HUMAN_AGENT', tool: '—', action: 'REJECT_ACTION', status: 'SUCCESS' });
  return esc;
}

export async function investigateEscalation(escalationId) {
  const esc = db.escalations.get(escalationId);
  if (!esc) throw new Error('Escalation not found');
  esc.status = 'MORE_INVESTIGATION_REQUESTED';
  db.tickets.get(esc.ticketId).status = 'OPEN';
  audit({ ticketId: esc.ticketId, resolutionId: esc.resolutionId, agent: 'HUMAN_AGENT', tool: '—', action: 'REQUEST_MORE_INVESTIGATION', status: 'SUCCESS' });
  return resolveTicket(esc.ticketId);
}

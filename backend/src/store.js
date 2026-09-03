import crypto from 'node:crypto';
import mongoose from 'mongoose';

export const db = {
  customers: new Map(),
  orders: new Map(),
  shipments: new Map(),
  inventory: new Map(),
  policies: [],
  tickets: new Map(),
  runs: new Map(),
  escalations: new Map(),
  audit: []
};

// Optional Mongoose initialization if MONGODB_URI is specified
export async function initMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return false;
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
    console.log('MongoDB connected successfully');
    return true;
  } catch (err) {
    console.warn('MongoDB connection fallback to in-memory store:', err.message);
    return false;
  }
}

export function resetSeed() {
  for (const value of Object.values(db)) Array.isArray(value) ? (value.length = 0) : value.clear();
  
  db.customers.set('CUST-1001', { id: 'CUST-1001', name: 'Aisha Kapoor', address: '14 Marine Drive, Mumbai 400020' });
  db.customers.set('CUST-2001', { id: 'CUST-2001', name: 'Rohan Mehta', address: '18 Residency Road, Bengaluru 560025' });
  
  db.orders.set('ORD-1001', { id: 'ORD-1001', customerId: 'CUST-1001', status: 'DELIVERED', item: 'AeroPod Pro', amount: 12999, payment: 'PAID' });
  db.orders.set('ORD-2001', { id: 'ORD-2001', customerId: 'CUST-2001', status: 'SHIPPED', item: 'Nexora Studio Console', amount: 80000, payment: 'PAID' });
  
  db.shipments.set('ORD-1001', { orderId: 'ORD-1001', tracking: 'TRK-88201', status: 'DELIVERED', deliveryAddress: '14 Marine Drive, Mumbai 400002', events: ['Packed', 'In transit', 'Delivered'] });
  db.shipments.set('ORD-2001', { orderId: 'ORD-2001', tracking: 'TRK-55830', status: 'IN_TRANSIT', deliveryAddress: '18 Residency Road, Bengaluru 560025', events: ['Packed', 'Shipped'] });
  
  db.inventory.set('AeroPod Pro', { sku: 'AEROPOD-PRO', available: 12, warehouse: 'Mumbai West DC' });
  db.inventory.set('Nexora Studio Console', { sku: 'STUDIO-CONSOLE', available: 2, warehouse: 'Bengaluru DC' });
  
  db.policies.push(
    { id: 'POL-DEL-04', name: 'Delivery Dispute Rules', section: '4.2 Delivered but not received', text: 'When tracking reports delivered and the confirmed customer address does not match the carrier delivery address, offer a replacement if inventory is available. Document the discrepancy before fulfillment.', tags: ['delivery_dispute', 'replacement', 'delivery'], risk: 'medium' },
    { id: 'POL-CAN-07', name: 'Cancellation Rules', section: '7.1 Orders in shipment', text: 'Cancellation after shipment is not automatically permitted. Orders exceeding ₹50,000 or with an active carrier handoff require a human support approval after carrier review.', tags: ['cancellation', 'cancel'], risk: 'high' },
    { id: 'POL-ESC-02', name: 'Escalation Rules', section: '2.3 Irreversible actions', text: 'When policy is conditional or evidence is incomplete, do not execute irreversible actions. Escalate with investigation context.', tags: ['escalation', 'cancellation'], risk: 'high' },
    { id: 'POL-REF-01', name: 'Refund & Return Rules', section: '1.4 General Refunds', text: 'Refund requests for unopened items within 14 days are allowed automatically up to ₹10,000. Higher amounts or damaged items require evidence verification and human review.', tags: ['refund', 'return'], risk: 'medium' }
  );

  const tickets = [
    { id: 'TKT-1001', demo: 'demo1', customerId: 'CUST-1001', orderId: 'ORD-1001', subject: 'Delivered but not received', message: 'My order says delivered but I never received it.', status: 'OPEN', createdAt: new Date().toISOString() },
    { id: 'TKT-2001', demo: 'demo2', customerId: 'CUST-2001', orderId: 'ORD-2001', subject: 'Cancel ₹80,000 order', message: 'Cancel my ₹80,000 order.', status: 'OPEN', createdAt: new Date().toISOString() }
  ];
  tickets.forEach((ticket) => db.tickets.set(ticket.id, ticket));
}

export function id(prefix) { return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`; }
export function audit(event) { db.audit.unshift({ id: id('AUD'), timestamp: new Date().toISOString(), ...event }); }

export function createTicket({ customerId, orderId, subject, message }) {
  const newId = id('TKT');
  const ticket = { id: newId, customerId: customerId || 'CUST-1001', orderId: orderId || 'ORD-1001', subject: subject || 'Support Request', message: message || '', status: 'OPEN', createdAt: new Date().toISOString() };
  db.tickets.set(newId, ticket);
  return ticket;
}

export function createPolicy({ name, section, text, tags, risk }) {
  const newId = id('POL');
  const policy = { id: newId, name, section: section || 'General', text, tags: tags || [], risk: risk || 'medium' };
  db.policies.push(policy);
  return policy;
}

resetSeed();

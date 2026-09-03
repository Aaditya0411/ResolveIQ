import { db } from '../store.js';

export const toolDefinitions = {
  get_order: ({ orderId }) => db.orders.get(orderId) || null,
  get_shipping: ({ orderId }) => db.shipments.get(orderId) || null,
  get_customer: ({ customerId }) => db.customers.get(customerId) || null,
  check_inventory: ({ item }) => db.inventory.get(item) || null,
  reserve_replacement: ({ item }) => {
    const inventory = db.inventory.get(item);
    if (!inventory || inventory.available < 1) throw new Error('Replacement inventory unavailable');
    inventory.available -= 1;
    return { reserved: true, item, remaining: inventory.available };
  },
  warehouse_notify: ({ orderId, item }) => ({ notified: true, notificationId: `WH-${orderId}`, item }),
  cancel_order: ({ orderId }) => {
    const order = db.orders.get(orderId);
    if (!order) throw new Error('Order not found');
    order.status = 'CANCELLED';
    return { cancelled: true, orderId };
  },
  process_refund: ({ orderId, amount }) => {
    const order = db.orders.get(orderId);
    if (!order) throw new Error('Order not found');
    order.status = 'REFUNDED';
    return { refunded: true, orderId, amount: amount || order.amount };
  }
};

export async function classifyAsync(ticket) {
  if (process.env.LLM_PROVIDER && process.env.LLM_API_KEY && process.env.LLM_PROVIDER !== 'deterministic') {
    try {
      const prompt = `Classify support ticket into category (cancellation_request, delivery_dispute, refund_request, damaged_item, shipping_delay, unknown). Return JSON: {"category": "..."}.\nTicket: ${ticket.subject} - ${ticket.message}`;
      const res = await fetch(process.env.LLM_ENDPOINT || 'https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.LLM_API_KEY}`
        },
        body: JSON.stringify({
          model: process.env.LLM_MODEL || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' }
        })
      });
      if (res.ok) {
        const json = await res.json();
        const parsed = JSON.parse(json.choices[0].message.content);
        if (parsed.category) {
          return buildClassification(parsed.category, ticket);
        }
      }
    } catch (err) {
      console.warn('LLM classification failed, falling back to rule-based:', err.message);
    }
  }
  return classify(ticket);
}

export function classify(ticket) {
  const text = `${ticket.subject} ${ticket.message}`.toLowerCase();
  
  if (text.includes('cancel')) {
    return buildClassification('cancellation_request', ticket);
  }
  if (text.includes('delivered') || text.includes('never received') || text.includes('not received')) {
    return buildClassification('delivery_dispute', ticket);
  }
  if (text.includes('refund') || text.includes('money back') || text.includes('return')) {
    return buildClassification('refund_request', ticket);
  }
  if (text.includes('damage') || text.includes('broken') || text.includes('defective')) {
    return buildClassification('damaged_item', ticket);
  }
  if (text.includes('delay') || text.includes('late') || text.includes('tracking')) {
    return buildClassification('shipping_delay', ticket);
  }

  return buildClassification('unknown', ticket);
}

function buildClassification(category, ticket) {
  const entities = { orderId: ticket.orderId, customerId: ticket.customerId };
  switch (category) {
    case 'cancellation_request':
      return { category, entities, requiredSystems: ['order', 'shipping', 'policy'], potentialActions: ['cancellation', 'escalation'], riskLevel: 'high' };
    case 'delivery_dispute':
      return { category, entities, requiredSystems: ['order', 'shipping', 'inventory', 'policy', 'warehouse'], potentialActions: ['replacement', 'refund', 'escalation'], riskLevel: 'medium' };
    case 'refund_request':
      return { category, entities, requiredSystems: ['order', 'billing', 'policy'], potentialActions: ['refund', 'escalation'], riskLevel: 'medium' };
    case 'damaged_item':
      return { category, entities, requiredSystems: ['order', 'shipping', 'inventory', 'policy'], potentialActions: ['replacement', 'refund', 'escalation'], riskLevel: 'medium' };
    case 'shipping_delay':
      return { category, entities, requiredSystems: ['order', 'shipping'], potentialActions: ['status_update', 'escalation'], riskLevel: 'low' };
    default:
      return { category: 'unknown', entities, requiredSystems: ['order', 'policy'], potentialActions: ['escalation'], riskLevel: 'high' };
  }
}

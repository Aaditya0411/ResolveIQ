import { db } from '../store.js';

export function retrievePolicy(categoryOrQuery) {
  const query = (categoryOrQuery || '').toLowerCase();
  
  const matches = db.policies.map((p) => {
    let score = 0;
    const pText = `${p.name} ${p.section} ${p.text}`.toLowerCase();
    
    // Tag match
    if (p.tags.some((t) => t.toLowerCase() === query || query.includes(t.toLowerCase()))) {
      score += 0.5;
    }
    
    // Category mapping
    if (query === 'delivery_dispute' && p.tags.includes('delivery_dispute')) score += 0.46;
    if (query === 'cancellation_request' && p.tags.includes('cancellation')) score += 0.46;
    if (query === 'refund_request' && p.tags.includes('refund')) score += 0.46;

    // Text keyword match
    const keywords = query.split(/\s+/).filter((k) => k.length > 2);
    for (const kw of keywords) {
      if (pText.includes(kw)) score += 0.15;
    }

    return { policy: p, score };
  });

  // Filter policies with positive score or fallback to all matching tags
  let filtered = matches
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((m) => m.policy);

  if (!filtered.length) {
    filtered = db.policies.filter((p) => p.tags.includes('escalation'));
  }

  return filtered.map((policy, i) => ({
    ...policy,
    retrievalScore: Number((0.96 - i * 0.07).toFixed(2)),
    retrievedAt: new Date().toISOString()
  }));
}

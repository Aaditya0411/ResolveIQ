export function safetyGate({ category, evidence, policies, proposedAction, order }) {
  const orderAmount = order?.amount || 0;
  const consistent = evidence.every((e) => e.consistent !== false);
  const hasPolicy = policies.length > 0;
  const addressMismatch = evidence.some((e) => e.type === 'ADDRESS_MISMATCH');
  const inventory = evidence.some((e) => e.type === 'INVENTORY_AVAILABLE');
  const highValue = orderAmount >= 50000;
  const isCancellation = proposedAction === 'CANCEL_ORDER';

  const autoSafe = category === 'delivery_dispute' && addressMismatch && inventory && hasPolicy && consistent;
  
  let confidence = 0.42;
  let decision = 'HUMAN_APPROVAL';
  let reason = 'Evidence or policy requirements are incomplete.';

  if (autoSafe) {
    confidence = 0.96;
    decision = 'AUTO_EXECUTE';
    reason = 'Carrier delivery address conflicts with the confirmed customer address; replacement inventory and applicable policy are present.';
  } else if (isCancellation && highValue) {
    confidence = 0.61;
    decision = 'HUMAN_APPROVAL';
    reason = 'Order is already shipped, cancellation is irreversible, value exceeds ₹50,000, and policy requires human approval.';
  } else if (category === 'unknown') {
    confidence = 0.30;
    decision = 'HUMAN_APPROVAL';
    reason = 'Category unknown or unspecified; automated execution paused for human agent inspection.';
  } else if (!hasPolicy) {
    confidence = 0.35;
    decision = 'HUMAN_APPROVAL';
    reason = 'No applicable policy retrieved to grant autonomous action authority.';
  }

  return {
    confidence,
    decision,
    reason,
    evidence,
    policies,
    requiredApproval: decision === 'HUMAN_APPROVAL',
    checks: { hasPolicy, consistent, highValue, addressMismatch, inventory }
  };
}

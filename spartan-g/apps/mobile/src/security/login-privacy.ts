import { receiptMatches, type PolicyActor, type PolicyReceipt, type PortalPolicy } from './policy-consent';

/** In-memory handoff of an explicit checkbox decision to this successful sign-in.
 * No credentials, Terms approval, server writes or cross-session consent. */
export function createLoginPrivacyHandoff(now: () => Date = () => new Date()) {
  type Attempt = { policy: PortalPolicy; result: Promise<PolicyReceipt | null>; settle(receipt: PolicyReceipt | null): void };
  let current: Attempt | null = null;
  return {
    begin(policy: PortalPolicy) {
      current?.settle(null);
      let settle!: Attempt['settle'];
      const result = new Promise<PolicyReceipt | null>(resolve => { settle = resolve; });
      const attempt: Attempt = { policy: { ...policy }, result, settle };
      current = attempt;
      return {
        complete(actor: PolicyActor | null) {
          if (current !== attempt) return;
          attempt.settle(actor ? { ...attempt.policy, owner: actor.owner, acceptedAt: now().toISOString() } : null);
        },
        cancel() { attempt.settle(null); if (current === attempt) current = null; },
      };
    },
    async read(actor: PolicyActor, policy: PortalPolicy): Promise<PolicyReceipt | null> {
      const attempt = current;
      if (!attempt) return null;
      const receipt = await attempt.result;
      return current === attempt && receiptMatches(receipt, actor.owner, policy) ? receipt : null;
    },
  };
}

export const loginPrivacyHandoff = createLoginPrivacyHandoff();

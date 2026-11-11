/** Web integration keeps its existing atomic-outbox protocol. Native rollout is separate. */
export function shouldWriteMessageOutbox(_db: unknown): boolean { return true; }

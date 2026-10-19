import type { Auth } from 'firebase-admin/auth';
import type { IncomingMessage } from 'node:http';
import { HttpFailure } from './errors';
import { gardenAudit, type GardenAuditSink } from '../garden-production/audit';
export function createTokenVerifier(auth: Pick<Auth, 'verifyIdToken'>, projectId: string, checkRevoked = true, sink?: GardenAuditSink) {
  return async (request: IncomingMessage): Promise<string> => {
    const count = request.rawHeaders.filter((_v, i, headers) => i % 2 === 0 && headers[i]?.toLowerCase() === 'authorization').length;
    const header = request.headers.authorization;
    if (count !== 1 || typeof header !== 'string' || header.length > 8192 || !/^Bearer [A-Za-z0-9_.-]+$/.test(header)) {
      gardenAudit('unauthenticated', {}, sink);
      throw new HttpFailure(401, 'unauthenticated', 'invalid_authentication');
    }
    try {
      const claims = await auth.verifyIdToken(header.slice(7), checkRevoked);
      if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`
          || typeof claims.uid !== 'string' || claims.uid !== claims.sub || !claims.uid.length || claims.uid.length > 128
          || claims.uid.includes('/') || claims.uid.trim() !== claims.uid || !Number.isFinite(claims.exp)
          || claims.exp * 1000 <= Date.now()) throw Error('Invalid claims');
      return claims.uid;
    } catch { gardenAudit('unauthenticated', {}, sink); throw new HttpFailure(401, 'unauthenticated', 'invalid_authentication'); }
  };
}

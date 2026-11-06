export class AppCheckUnavailableError extends Error{constructor(){super('AI attestation is disabled in staging.');}}
export function getNativeAppCheck():never{throw new AppCheckUnavailableError();}

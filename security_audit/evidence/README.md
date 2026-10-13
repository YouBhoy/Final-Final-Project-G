# Evidence handling

- local-assessment.json: tracked-source inventory, sanitized secret indicators, boolean local key presence, exact lockfile versions, historical advisory summaries and configured browser headers. No key/password/token contents are included.
- findings.json: structured finding records with actual source locations and verification text.
- verification-summary.json: executed commands and honest results.

No environment files, user records, database dumps or raw emulator logs were copied here. Tests use synthetic notes, bodies and users only. Raw Firebase CLI logs can contain process environment variables, so they are excluded. The temporary local-cli-config directory isolates CLI preferences and is ignored by the audit .gitignore.

Reproduce inventory from repository root: `node security_audit/remediation/collect-evidence.mjs`. Source/config scan covers tracked first-party files, not Git history or the validity of credential-like strings. Two ignored local privileged key files were detected; this is not evidence of public disclosure.

Historical dependency reports originated at spartan-g/docs/security/security-audit-{root,workspaces,functions}-2026-10-12.json. Fresh checks on October 13 failed to reach the advisory endpoint. Preserve that distinction.

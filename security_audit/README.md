# Security audit — October 13, 2026

Workspace: E:\Finalt-Project-G. Baseline: 7e671a3119f8fe547ea32b8dff539c72fb60b538.

**10 confirmed vulnerabilities: 4 patched, 1 partially addressed, 5 otherwise open.** Also recorded 2 potential risks and 2 hardening items (one implemented). All 14 items: 0 Critical / 7 High / 6 Medium / 1 Low. Nothing deployed; no live data or credentials changed.

## Reports

- [Security assessment](reports/SECURITY_ASSESSMENT_REPORT.md)
- [Detailed findings](reports/VULNERABILITY_FINDINGS.md)
- [Risk assessment](reports/RISK_ASSESSMENT.md)
- [Remediation plan](reports/REMEDIATION_PLAN.md)
- [Fix changelog](remediation/SECURITY_FIXES_CHANGELOG.md)
- [Patch verification](remediation/PATCH_VERIFICATION.md)
- [Security checklist](checklists/SECURITY_CHECKLIST.md)
- [Sanitized evidence](evidence/README.md)

Each report’s absolute path is this directory, E:\Finalt-Project-G\security_audit, plus its linked relative path above. For a machine-readable list, see evidence/findings.json.

## Priorities

Protect full appointment and assignment/resource file privacy (SEC-003/009), then make assessment scoring/alerts authoritative (SEC-004). Review and approve the staged design in REMEDIATION_PLAN.md before architectural changes. Registry audits need a successful rerun; historical critical package advisories remain unvalidated. Workspace-wide typechecking remains blocked by existing mobile/shared-UI errors.

## Reproduce safely

Run the commands in PATCH_VERIFICATION.md. Emulator tests write only synthetic data into a loopback demo project and stop when local emulator variables are missing. Never run maintenance migrations, seeders, promotion or cleanup scripts against live data as audit tests. The evidence collector is local and read-only except for rewriting sanitized audit artifacts.

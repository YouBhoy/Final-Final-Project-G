# Risk assessment

Qualitative ratings reflect the original weakness and source capabilities, not an observed incident. Patched items reduce local residual risk; deployment remains unverified. Potential items are provisional. Critical means broad, readily exploitable system compromise; none was established. High covers cross-user private data or important integrity failures. Medium covers bounded abuse or workflow integrity. Low covers defense in depth without a demonstrated direct compromise.

## Risk matrix

| Likelihood / impact | Low impact | Medium impact | High impact |
|---|---|---|---|
| Low | Low | Low–Medium | Medium |
| Medium | Low | Medium | High |
| High | Medium | Medium–High | High |
| Unknown | Validate first | Validate first | Provisional High |

The matrix guides judgment; access requirements, sensitivity and existing controls determine the final rating.

| ID | Likelihood | Confidentiality impact | Integrity impact | Availability impact | Severity | Priority |
|---|---|---|---|---|---|---|
| SEC-001 | High | Low | High | Medium | High | P1 |
| SEC-002 | High | High | High | Medium | High | P1 |
| SEC-003 | High | High | Low | Low | High | P1 |
| SEC-004 | High | Medium | High | Medium | High | P1 |
| SEC-005 | High | Low | Medium | Medium | Medium | P2 |
| SEC-006 | Medium | Low | Medium | Medium | Medium | P2 |
| SEC-007 | Medium | Low | Medium | Medium | Medium | P2 |
| SEC-008 | Medium | Low | Medium | Medium | Medium | P2 |
| SEC-009 | High | High | Medium | Medium | High | P1 |
| SEC-010 | High | Medium | Low | Low | Medium | P2 |
| SEC-011 | Unknown | Unknown | Unknown | Unknown | High | P1 |
| SEC-012 | Medium | Low | Low | Low | Low | P3 |
| SEC-013 | Unknown | High if valid | High if valid | High if valid | High | P1 |
| SEC-014 | Medium | Low | Low | Medium | Medium | P2 |

- **SEC-001:** Unauthorized message insertion, notification harassment and unbounded input into the push trigger. Does not imply disclosure of existing messages. High rating reflects sensitive counseling data or meaningful cross-user integrity access through ordinary authenticated requests.
- **SEC-002:** Cross-conversation attachment disclosure, replacement and deletion through authenticated Storage requests. High rating reflects sensitive counseling data or meaningful cross-user integrity access through ordinary authenticated requests.
- **SEC-003:** Exposure of other students’ identities, notes and any additional private fields in active appointment documents. High rating reflects sensitive counseling data or meaningful cross-user integrity access through ordinary authenticated requests.
- **SEC-004:** Manipulated screening risk, inconsistent clinical summaries, missing alerts and altered submitted response records; trusted scoring is not guaranteed. High rating reflects sensitive counseling data or meaningful cross-user integrity access through ordinary authenticated requests.
- **SEC-005:** Misleading privileged-looking messages, harassment and storage/UI abuse; no proven code execution. Rating reflects bounded access requirements and the observed scope; broader compromise was not demonstrated.
- **SEC-006:** Legacy slot poisoning, changed facilitator/time data and reduced availability. Does not establish bypass of the protected appointment_reservations workflow. Rating reflects bounded access requirements and the observed scope; broader compromise was not demonstrated.
- **SEC-007:** Push registration corruption and notification denial. The flaw alone did not expose the victim’s token through reads. Rating reflects bounded access requirements and the observed scope; broader compromise was not demonstrated.
- **SEC-008:** Schedule poisoning or misattribution affecting another facilitator’s displayed availability. Rating reflects bounded access requirements and the observed scope; broader compromise was not demonstrated.
- **SEC-009:** Assignment privacy loss and access to unpublished or role-restricted files through known object paths; unrelated facilitator deletion. High rating reflects sensitive counseling data or meaningful cross-user integrity access through ordinary authenticated requests.
- **SEC-010:** Deactivated users retain selected reads/writes while their Auth session is valid. Most role-based collection access correctly requires isActive. Rating reflects bounded access requirements and the observed scope; broader compromise was not demonstrated.
- **SEC-011:** Possible compromised or vulnerable tooling/runtime dependencies; severity is provisional pending fresh advisory and reachability analysis. Likelihood cannot be established without operational/advisory validation.
- **SEC-012:** Reduced browser protection against framing and MIME confusion. Rating reflects bounded access requirements and the observed scope; broader compromise was not demonstrated.
- **SEC-013:** A stolen valid Admin credential could bypass client rules within its IAM privileges. Presence of a local key is not proof of leaked credentials. Likelihood cannot be established without operational/advisory validation.
- **SEC-014:** Authorized or compromised staff accounts could increase AI spend, provider load and latency. Rating reflects bounded access requirements and the observed scope; broader compromise was not demonstrated.

## Business impact and urgent residual risks

Appointment notes and screening data are sensitive student information. Their disclosure can damage privacy and confidence in counseling. False risk classifications and missing alerts can mislead facilitator workflows; these are the most urgent integrity risks. Assignment/resource storage must match its privacy promise. Notification and legacy slot abuse can reduce trust and service availability. Dependencies/key handling need validation, not an assumption of compromise. No financial loss, patient harm or actual breach was established.

# Assessment listing on Spark

Student and facilitator lists read `assessment_catalog` through the Firebase client SDK.
Only active accounts can read published catalog entries; client writes are denied.
Catalog document IDs match the original assessment definition IDs, so existing start links work.
The catalog contains title, courseId, description, maxAttempts, isPublished, and questionCount.
Questions, answer keys, private metadata, and all documents containing studentId are excluded.
The original assessments collection and its access rules remain unchanged.

After creating, editing, publishing, unpublishing, or deleting a course-based definition, run:

```powershell
npm.cmd run sync:assessment-catalog
```

Run from `spartan-g`. This trusted maintenance command uses the existing ignored
`scripts/service-account.json` Admin SDK credential for `spartan-g-a2d80`.
It replaces catalog entries with the allowed fields and removes stale entries.
It does not modify source assessments. No Cloud Functions or billing upgrade is required.
Publication changes reach the listing only after this command completes.

Validation: `npm.cmd run test:assessment-catalog` and
`npm.cmd run typecheck --workspace=@spartan-g/web`.

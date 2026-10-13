export { onMessageCreate } from './onMessageCreate.js';
export { adminSetUserPassword, adminUpdateUser } from './adminUserFunctions.js';
// Appointment operations use rule-validated Firestore reservations on Spark.
// Do not export the retired booking handlers: they bypass the reservation workflow.
export { generateAssessmentSummary } from './assessmentSummary.js';
export { getPublishedAssessmentDefinitions } from './assessmentDefinitions.js';
export { adminUpdateStudentProfile } from './adminStudentProfile.js';
export { superAdminOverrideAttempts } from './assessmentOverride.js';

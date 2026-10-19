// Approved private-test scope only. Not imported by the normal application entry.
export const RUN_ID = 'sg_ai_synth_20261019_01';
export const STUDENT_UID = RUN_ID + '_student';
export const STAFF_UID = RUN_ID + '_facilitator';
export const ATTEMPT_ID = RUN_ID + '_builtin_' + STUDENT_UID + '_1';
export const TEST_CONFIG = Object.freeze({ enabled: true, dataMode: 'synthetic-only' as const,
  projectId: 'spartan-g-a2d80' as const, androidAppId: '1:250999113503:android:e2cc2c39b6b16decacd22a',
  syntheticAccountUids: Object.freeze([STUDENT_UID, STAFF_UID]), syntheticAttemptIds: Object.freeze([ATTEMPT_ID]),
});
export const ACCOUNTS = Object.freeze([
  Object.freeze({ uid: STUDENT_UID, email: 'student.' + RUN_ID + '@example.invalid', role: 'student' as const }),
  Object.freeze({ uid: STAFF_UID, email: 'facilitator.' + RUN_ID + '@example.invalid', role: 'facilitator' as const }),
]);
export const BASIC_INPUT = 'Hello Sparty. This is an entirely fictional software test. Please greet me briefly.';
export const TOOL_INPUT = 'For this fictional test account, do I have any pending assessments to finish? Please check using the pending-assessments tool.';

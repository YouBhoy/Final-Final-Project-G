import type { ReferralForecast } from '../utils/referralForecast';

export interface StatisticsFilters {
  startDate: string;
  endDate: string;
  campus: string;
  assessmentId: string;
  interval: 'daily' | 'weekly' | 'monthly';
}
export interface ParticipationSummary {
  participants: number;
  appointmentStudents: number;
  messagingStudents: number;
  assessmentStudents: number;
  appointmentRequests: number;
  attempts: number;
  submissions: number;
  registered: number;
  participationRate: number | null;
  starters: number;
  completedStarters: number;
  incompleteStarters: number;
  completionRate: number | null;
  inProgress: number;
  retakes: number;
  submissionRate: number | null;
  averageAttemptsPerStudent: number | null;
}
export interface StatisticsReport {
  generatedAt: string;
  sourceLoadedAt?: string;
  filters: StatisticsFilters;
  referrals: {
    forecast: ReferralForecast;
    requests: number;
    requestingStudents: number;
    pending: number;
    accepted: number;
    statuses: { key: string; label: string; requests: number }[];
    trends: { label: string; startDate: string; endDate: string; partial: boolean; requests: number }[];
    coverage: {
      missingRequestDates: number;
      futureDatedRequests: number;
      missingCampusSnapshots: number;
      missingStudentIds: number;
      unknownStudentAccounts: number;
      conflictingDates: number;
      legacyDateFallbacks: number;
    };
  };
  campuses: { key: string; label: string }[];
  assessments: { id: string; title: string }[];
  totals: ParticipationSummary;
  accountActivity: {
    studentAccounts: number;
    activeStudentAccounts: number | null;
    studentsWithUnknownActiveStatus: number;
    facilitatorAccounts: number;
    activeFacilitatorAccounts: number | null;
    facilitatorsWithUnknownActiveStatus: number;
    acceptedStudentLinks: number;
    facilitatorsWithAcceptedStudents: number;
    facilitatorsWithRequests: number;
  };
  gradedScores: {
    assessmentId: string; title: string; suppressed: boolean;
    sample: number | null; mean: number | null; median: number | null;
    bins: { label: string; count: number | null }[];
  }[];
  participation: (ParticipationSummary & { campus: string; label: string })[];
  assessmentCohorts: { assessmentId: string; title: string; attempts: number; submissions: number; participatingStudents: number; starters: number; completed: number; remaining: number; rate: number | null; submissionRate: number | null; inProgress: number; retakes: number }[];
  trends: { label: string; startDate: string; endDate: string; partial: boolean; participants: number; appointmentRequests: number; messagingStudents: number; attempts: number; submissions: number; assessmentStudents: number; retakes: number }[];
  scores: {
    campus: string; label: string; instrument: string; version: string; max: number;
    suppressed: boolean; sample: number | null; median: number | null;
    q1: number | null; q3: number | null; mean: number | null;
    bins: { label: string; count: number | null }[];
  }[];
  coverage: Record<string, number>;
  attemptDataQuality: {
    invalidRecords: number;
    duplicateLogicalAttempts: number;
    missingRequiredFields: number;
    invalidStatuses: number;
    invalidTimestamps: number;
    invalidAttemptNumbers: number;
    identityMismatches: number;
  };
  notes: string[];
}

import { collection, doc, getDocFromServer, getDocsFromServer, limit, query, type Firestore } from 'firebase/firestore';
import type { StatisticsSource } from './statisticsData';

/** Client SDK reads always pass through the deployed Firestore security rules. */
export function createFirestoreStatisticsSource(db: Firestore, currentUid: () => string | null): StatisticsSource {
  return {
    currentUid,
    user: async uid => (await getDocFromServer(doc(db, 'users', uid))).data(),
    records: async (name, maximum) => {
      const snapshot = await getDocsFromServer(query(collection(db, name), limit(maximum)));
      return snapshot.docs.map(record => ({ ...record.data(), id: record.id }));
    },
  };
}

export interface CampusPeriodAggregate {
  campusKey: string;
  campusLabel: string;
  periodStartDate: string;
  locked: boolean;
  isComplete: boolean;
  dataPhase: 'development' | 'real_pilot';
  registeredStudentUsers: { value: number | null; suppressed: boolean; display: string };
  participatingStudents: { value: number | null; suppressed: boolean; display: string };
  appointmentRequests: { value: number | null; suppressed: boolean; display: string };
  assessmentSubmissions: { value: number | null; suppressed: boolean; display: string };
  participationRateBand: string;
  appointmentDemandBand: string;
  assessmentSubmissionBand: string;
}

export async function loadCampusPeriodAggregates(db: Firestore): Promise<CampusPeriodAggregate[]> {
  const snapshot = await getDocsFromServer(collection(db, 'analytics/campusPeriods/records'));
  return snapshot.docs
    .map(record => ({ id: record.id, ...record.data() } as unknown as CampusPeriodAggregate))
    .filter(row => row.locked && row.isComplete)
    .sort((a, b) => b.periodStartDate.localeCompare(a.periodStartDate));
}

export interface ClusteringStatus {
  status: 'available' | 'disabled';
  enabled: boolean;
  usableRows: number;
  usableCampuses: number;
  stabilityMethod: string;
  k: number;
  publishedMembership: boolean;
  diagnosticLabels: boolean;
  reason: string;
}

export async function loadClusteringStatus(db: Firestore): Promise<ClusteringStatus | null> {
  const result = await getDocFromServer(doc(db, 'analytics', 'clusteringStatus'));
  return result.exists() ? result.data() as ClusteringStatus : null;
}

export async function loadFacilitatorWorkload(db: Firestore): Promise<any[]> {
  const snapshot = await getDocsFromServer(collection(db, 'analytics/facilitatorWorkload/records'));
  return snapshot.docs.map(record => ({ id: record.id, ...record.data() }));
}

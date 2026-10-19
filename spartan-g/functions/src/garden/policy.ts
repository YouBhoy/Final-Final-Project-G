import type { GardenState, RewardCalculation, WateringCalculation } from './types';
import { isPreviousUtcDay, utcDayFromDate } from './dates';
import { GardenValidationError, nonnegativeInteger, parseDocumentId, parseGardenState } from './validation';

/** Mirrors the existing GardenService/Repository, with no change to mobile behavior. */
export const GARDEN_POLICY = Object.freeze({
  assessmentXp: 10, assessmentSeeds: 5, wateringXp: 2, wateringSeedCost: 0,
  levelThresholdMultiplier: 50,
});

export function createInitialGardenState(studentId: string): GardenState {
  return {
    studentId: parseDocumentId(studentId, 'studentId'), level: 1, xp: 0, seeds: 0,
    streakCount: 0, lastCheckInDate: '', lastWateredDate: '',
  };
}

function add(value: number, gain: number, field: string): number {
  return nonnegativeInteger(value + gain, field);
}

function levelProgress(garden: GardenState, gain: number) {
  const totalXp = add(garden.xp, gain, 'xp');
  const threshold = garden.level * GARDEN_POLICY.levelThresholdMultiplier;
  if (!Number.isSafeInteger(threshold)) {
    throw new GardenValidationError('level', 'threshold exceeds safe integer range');
  }
  // Intentionally one check, even if legacy XP exceeds multiple thresholds.
  const leveledUp = totalXp >= threshold;
  return {
    xp: leveledUp ? totalXp - threshold : totalXp,
    level: leveledUp ? add(garden.level, 1, 'level') : garden.level,
    leveledUp,
  };
}

/** Calculation only. Eligibility and duplicate prevention require a future trusted transaction. */
export function calculateAssessmentReward(input: GardenState, instant: Date): RewardCalculation {
  const garden = parseGardenState(input, input.studentId);
  const day = utcDayFromDate(instant);
  const streakCount = garden.lastCheckInDate === day ? garden.streakCount
    : garden.lastCheckInDate !== '' && isPreviousUtcDay(garden.lastCheckInDate, day)
      ? add(garden.streakCount, 1, 'streakCount') : 1;
  const { xp, level, leveledUp } = levelProgress(garden, GARDEN_POLICY.assessmentXp);
  return {
    day, xpAwarded: GARDEN_POLICY.assessmentXp, seedsAwarded: GARDEN_POLICY.assessmentSeeds,
    leveledUp,
    garden: {
      ...garden, xp, level, seeds: add(garden.seeds, GARDEN_POLICY.assessmentSeeds, 'seeds'),
      streakCount, lastCheckInDate: day,
    },
  };
}

export function calculateWateringReward(input: GardenState, instant: Date): WateringCalculation {
  const garden = parseGardenState(input, input.studentId);
  const day = utcDayFromDate(instant);
  if (garden.lastWateredDate === day) return { status: 'already', day, garden };
  const { xp, level, leveledUp } = levelProgress(garden, GARDEN_POLICY.wateringXp);
  return {
    status: 'rewarded', day, xpAwarded: GARDEN_POLICY.wateringXp, seedsAwarded: 0, leveledUp,
    garden: { ...garden, xp, level, lastWateredDate: day },
  };
}

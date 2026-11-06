import { gardenRepository } from '../repositories/garden.repository';
import { clientGardenRewardsAvailable } from '../config/garden-capabilities';

export type GardenLoadResult =
  | { status: 'ready'; garden: NonNullable<Awaited<ReturnType<typeof gardenRepository.getGarden>>> }
  | { status: 'empty' }
  | { status: 'error'; code: 'permission-denied' | 'unauthenticated' | 'network' | 'invalid-data' | 'unknown'; message: string };

class GardenService {
  /** Authoritative read only. Missing data is distinct from a failed read; no reward or initialization writes. */
  async loadGarden(studentId: string): Promise<GardenLoadResult> {
    if (!studentId) return { status: 'error', code: 'unauthenticated', message: 'Sign in again to open your Garden.' };
    try {
      const savedGarden = await gardenRepository.getGarden(studentId, true);
      if (!savedGarden) return { status: 'empty' };
      // Older Gardens predate daily watering. Supply only its absent marker in
      // this read result; never write it back or replace a present invalid value.
      const garden = Object.prototype.hasOwnProperty.call(savedGarden, 'lastWateredDate')
        ? savedGarden
        : { ...savedGarden, lastWateredDate: '' };
      const validDay = (value: unknown) => typeof value === 'string' && (value === '' ||
        (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value));
      if (garden.studentId !== studentId || garden.id !== studentId ||
          !Number.isSafeInteger(garden.level) || garden.level < 1 ||
          ![garden.xp, garden.seeds, garden.streakCount].every(value => Number.isSafeInteger(value) && value >= 0) ||
          !validDay(garden.lastCheckInDate) || !validDay(garden.lastWateredDate)) {
        return { status: 'error', code: 'invalid-data', message: 'Your saved Garden could not be read safely. Its progress has not been changed.' };
      }
      return { status: 'ready', garden };
    } catch (error) {
      // Never log the raw exception: it may contain account/document identifiers.
      const rawCode = (error as { code?: unknown })?.code;
      const code = typeof rawCode === 'string' ? rawCode.replace(/^firestore\//, '') : '';
      if (code === 'permission-denied') return { status: 'error', code, message: 'Garden access was denied. Your saved progress has not been changed. Please contact support if retrying does not help.' };
      if (code === 'unauthenticated') return { status: 'error', code, message: 'Your session could not be verified. Sign in again to open your Garden.' };
      if (['unavailable', 'deadline-exceeded', 'network-request-failed', 'cancelled'].includes(code ?? ''))
        return { status: 'error', code: 'network', message: 'Could not connect to your Garden. Check your connection and try again.' };
      return { status: 'error', code: 'unknown', message: 'Garden could not be loaded. Please try again. Your saved progress has not been changed.' };
    }
  }

  /**
   * Get the student's garden doc, creating it if it doesn't exist.
   * Never throws — returns null on error.
   */
  async getOrCreateGarden(studentId: string) {
    try {
      let garden = await gardenRepository.getGarden(studentId);
      if (!garden) {
        await gardenRepository.createGarden(studentId);
        garden = await gardenRepository.getGarden(studentId);
      }
      return garden;
    } catch (err) {
      console.error('[GardenService] getOrCreateGarden failed:', err);
      return null;
    }
  }

  /**
   * Record a check-in for a garden. Best-effort, never throws.
   * Awards XP and seeds, manages streak, and handles level-up.
   */
  async recordCheckIn(studentId: string): Promise<void> {
    if (!clientGardenRewardsAvailable) return;
    try {
      // Ensure garden doc exists
      let garden = await gardenRepository.getGarden(studentId);
      if (!garden) {
        await gardenRepository.createGarden(studentId);
        garden = await gardenRepository.getGarden(studentId);
      }
      if (!garden) return; // still null after creation attempt — give up

      const today = new Date();
      const todayStr = today.toISOString().split('T')[0]; // 'YYYY-MM-DD'
      const yesterdayStr = new Date(today.getTime() - 86400000).toISOString().split('T')[0];

      // Determine streak
      let newStreakCount: number;
      if (garden.lastCheckInDate === todayStr) {
        // Already checked in today — streak unchanged, but still give rewards
        newStreakCount = garden.streakCount;
      } else if (garden.lastCheckInDate === yesterdayStr) {
        // Consecutive day — increment streak
        newStreakCount = garden.streakCount + 1;
      } else {
        // Gap — reset streak to 1
        newStreakCount = 1;
      }

      // Award base XP and seeds
      const xpGain = 10;
      const seedsGain = 5;

      // Calculate new total XP (pre level-up)
      const newTotalXp = garden.xp + xpGain;
      const xpNeededForNextLevel = garden.level * 50;

      // Apply the reward increment and streak in Firestore
      await gardenRepository.incrementReward(
        studentId,
        xpGain,
        seedsGain,
        todayStr,
        newStreakCount,
      );

      // Level-up check: if newTotalXp >= threshold, level up
      if (newTotalXp >= xpNeededForNextLevel) {
        const remainingXp = newTotalXp - xpNeededForNextLevel;
        await gardenRepository.applyLevelUp(studentId, garden.level + 1, remainingXp);
      }
    } catch (err) {
      console.error('[GardenService] recordCheckIn failed (non-fatal):', err);
      // Never throw — best effort only
    }
  }
/**
   * Daily watering reward. Best-effort, never throws.
   *
   * Grants +2 XP (atomic increment, same as the check-in reward) and stamps
   * lastWateredDate — but only the first time each calendar day. Repeated taps
   * on the same day do nothing and return 'already'. The tree's visual stage is
   * NOT changed directly here; the XP just feeds the existing level system that
   * drives the stage shown on the Garden hero card.
   *
   * @returns 'rewarded' — XP granted this tap
   *          'already'  — already watered today (no extra XP)
   *          'failed'   — an error occurred / no garden doc
   */
  async waterGarden(studentId: string): Promise<'rewarded' | 'already' | 'failed' | 'unavailable'> {
    if (!clientGardenRewardsAvailable) return 'unavailable';
    try {
      let garden = await gardenRepository.getGarden(studentId);
      if (!garden) {
        await gardenRepository.createGarden(studentId);
        garden = await gardenRepository.getGarden(studentId);
      }
      if (!garden) return 'failed';

      const today = new Date();
      const todayStr = today.toISOString().split('T')[0]; // 'YYYY-MM-DD'

      if (garden.lastWateredDate === todayStr) {
        return 'already'; // no repeat XP
      }

      await gardenRepository.applyWaterReward(studentId, todayStr);

      // Level-up check — reuses the exact threshold pattern from recordCheckIn.
      const xpGain = 2;
      const newTotalXp = garden.xp + xpGain;
      const xpNeededForNextLevel = garden.level * 50;
      if (newTotalXp >= xpNeededForNextLevel) {
        const remainingXp = newTotalXp - xpNeededForNextLevel;
        await gardenRepository.applyLevelUp(studentId, garden.level + 1, remainingXp);
      }

      return 'rewarded';
    } catch (err) {
      console.error('[GardenService] waterGarden failed (non-fatal):', err);
      return 'failed';
    }
  }
}

export const gardenService = new GardenService();

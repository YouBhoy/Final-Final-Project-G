import { gardenRepository } from '../repositories/garden.repository';

class GardenService {
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
  async waterGarden(studentId: string): Promise<'rewarded' | 'already' | 'failed'> {
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
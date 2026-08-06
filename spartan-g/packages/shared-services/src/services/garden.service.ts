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
}

export const gardenService = new GardenService();
import { type IAgentRuntime, type Memory, type State, type UUID } from '@elizaos/core';

/**
 * Interface for daily plan data
 */
export interface DailyPlan {
  userId: UUID;
  date: string;
  plan: string;
  createdAt: number;
}

/**
 * Formats daily plan for a specific user into context
 *
 * @param {IAgentRuntime} runtime - The runtime instance
 * @param {UUID} userId - The user ID to get the daily plan for
 * @returns {Promise<string>} The formatted daily plan context
 */
export async function formatDailyPlan(runtime: IAgentRuntime, userId: UUID): Promise<string> {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const cacheKey = `daily-plan-${userId}-${today}`;

    // Try to get today's plan from cache
    const cachedPlan = await runtime.getCache(cacheKey);

    if (cachedPlan && typeof cachedPlan === 'object' && 'plan' in cachedPlan) {
      return `Today's Plan for User:\n${cachedPlan.plan}`;
    }

    return '';
  } catch (error) {
    console.error('Error formatting daily plan:', error);
    return '';
  }
}

/**
 * Store daily plan for a user
 *
 * @param {IAgentRuntime} runtime - The runtime instance
 * @param {UUID} userId - The user ID
 * @param {string} plan - The daily plan content
 * @returns {Promise<void>}
 */
export async function storeDailyPlan(
  runtime: IAgentRuntime,
  userId: UUID,
  plan: string
): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const cacheKey = `daily-plan-${userId}-${today}`;

    const dailyPlan: DailyPlan = {
      userId,
      date: today,
      plan,
      createdAt: Date.now(),
    };

    await runtime.setCache(cacheKey, dailyPlan);
  } catch (error) {
    console.error('Error storing daily plan:', error);
  }
}

/**
 * Get daily plan for a user
 *
 * @param {IAgentRuntime} runtime - The runtime instance
 * @param {UUID} userId - The user ID
 * @param {string} date - The date in YYYY-MM-DD format (optional, defaults to today)
 * @returns {Promise<DailyPlan | null>}
 */
export async function getDailyPlan(
  runtime: IAgentRuntime,
  userId: UUID,
  date?: string
): Promise<DailyPlan | null> {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const cacheKey = `daily-plan-${userId}-${targetDate}`;

    const cachedPlan = await runtime.getCache(cacheKey);

    if (cachedPlan && typeof cachedPlan === 'object' && 'plan' in cachedPlan) {
      return cachedPlan as DailyPlan;
    }

    return null;
  } catch (error) {
    console.error('Error getting daily plan:', error);
    return null;
  }
}

/**
 * Daily plan provider that adds the user's daily plan to the context
 */
export const dailyPlanProvider = {
  name: 'DAILY_PLAN',
  description: "Provides the user's daily plan for relationship growth and connection",
  position: 0,
  get: async (runtime: IAgentRuntime, message: Memory, _state?: State) => {
    try {
      // Get the user ID from the message
      const userId = message.entityId;

      if (!userId) {
        return {
          values: {
            dailyPlan: '',
          },
          data: {
            dailyPlan: null,
          },
          text: '',
        };
      }

      // Get today's daily plan for the user
      const dailyPlan = await formatDailyPlan(runtime, userId);

      return {
        values: {
          dailyPlan,
        },
        data: {
          dailyPlan: await getDailyPlan(runtime, userId),
        },
        text: dailyPlan,
      };
    } catch (error) {
      console.error('Error in daily plan provider:', error);
      return {
        values: {
          dailyPlan: '',
        },
        data: {
          dailyPlan: null,
        },
        text: '',
      };
    }
  },
};

import { type IAgentRuntime, type Memory, type State, type UUID } from '@elizaos/core';

/**
 * Interface for weekly plan data
 */
export interface WeeklyPlan {
  userId: UUID;
  weekStartDate: string;
  weekOverview: string;
  mondayTheme: string;
  mondayActivities: string;
  tuesdayTheme: string;
  tuesdayActivities: string;
  wednesdayTheme: string;
  wednesdayActivities: string;
  thursdayTheme: string;
  thursdayActivities: string;
  fridayTheme: string;
  fridayActivities: string;
  saturdayTheme: string;
  saturdayActivities: string;
  sundayTheme: string;
  sundayActivities: string;
  weeklyGoals: string;
  successMetrics: string;
  createdAt: number;
}

/**
 * Get the start date of the current week (Monday)
 */
function getWeekStartDate(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
}

/**
 * Get the start date of the previous week (Monday)
 */
function getPreviousWeekStartDate(date: Date): Date {
  const currentWeekStart = getWeekStartDate(date);
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(currentWeekStart.getDate() - 7);
  return previousWeekStart;
}

/**
 * Get current day's theme and activities from weekly plan
 */
export async function getCurrentDayThemeFromWeeklyPlan(
  runtime: IAgentRuntime,
  userId: UUID
): Promise<{ theme: string; activities: string }> {
  try {
    const weekStartDate = getWeekStartDate(new Date()).toISOString().split('T')[0];
    const weeklyPlan = await getWeeklyPlan(runtime, userId, weekStartDate);

    if (!weeklyPlan) {
      return { theme: '', activities: '' };
    }

    const currentDay = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.

    switch (currentDay) {
      case 1: // Monday
        return { theme: weeklyPlan.mondayTheme, activities: weeklyPlan.mondayActivities };
      case 2: // Tuesday
        return { theme: weeklyPlan.tuesdayTheme, activities: weeklyPlan.tuesdayActivities };
      case 3: // Wednesday
        return { theme: weeklyPlan.wednesdayTheme, activities: weeklyPlan.wednesdayActivities };
      case 4: // Thursday
        return { theme: weeklyPlan.thursdayTheme, activities: weeklyPlan.thursdayActivities };
      case 5: // Friday
        return { theme: weeklyPlan.fridayTheme, activities: weeklyPlan.fridayActivities };
      case 6: // Saturday
        return { theme: weeklyPlan.saturdayTheme, activities: weeklyPlan.saturdayActivities };
      case 0: // Sunday
        return { theme: weeklyPlan.sundayTheme, activities: weeklyPlan.sundayActivities };
      default:
        return { theme: '', activities: '' };
    }
  } catch (error) {
    console.error('Error getting current day theme from weekly plan:', error);
    return { theme: '', activities: '' };
  }
}

/**
 * Formats previous week's full plan for context
 *
 * @param {IAgentRuntime} runtime - The runtime instance
 * @param {UUID} userId - The user ID to get the previous weekly plan for
 * @returns {Promise<string>} The formatted previous weekly plan context
 */
export async function formatPreviousWeekPlan(
  runtime: IAgentRuntime,
  userId: UUID
): Promise<string> {
  try {
    const previousWeekStartDate = getPreviousWeekStartDate(new Date()).toISOString().split('T')[0];
    const previousWeekPlan = await getWeeklyPlan(runtime, userId, previousWeekStartDate);

    if (previousWeekPlan) {
      return `# Previous Week's Plan (Week of ${previousWeekStartDate})

## Week Overview
${previousWeekPlan.weekOverview}

## Daily Themes & Activities
**Monday:** ${previousWeekPlan.mondayTheme}
Activities: ${previousWeekPlan.mondayActivities}

**Tuesday:** ${previousWeekPlan.tuesdayTheme}
Activities: ${previousWeekPlan.tuesdayActivities}

**Wednesday:** ${previousWeekPlan.wednesdayTheme}
Activities: ${previousWeekPlan.wednesdayActivities}

**Thursday:** ${previousWeekPlan.thursdayTheme}
Activities: ${previousWeekPlan.thursdayActivities}

**Friday:** ${previousWeekPlan.fridayTheme}
Activities: ${previousWeekPlan.fridayActivities}

**Saturday:** ${previousWeekPlan.saturdayTheme}
Activities: ${previousWeekPlan.saturdayActivities}

**Sunday:** ${previousWeekPlan.sundayTheme}
Activities: ${previousWeekPlan.sundayActivities}

## Weekly Goals
${previousWeekPlan.weeklyGoals}

## Success Metrics
${previousWeekPlan.successMetrics}`;
    }

    return 'No previous weekly plan available.';
  } catch (error) {
    console.error('Error formatting previous weekly plan:', error);
    return 'No previous weekly plan available.';
  }
}

/**
 * Formats weekly plan for a specific user into context
 *
 * @param {IAgentRuntime} runtime - The runtime instance
 * @param {UUID} userId - The user ID to get the weekly plan for
 * @returns {Promise<string>} The formatted weekly plan context
 */
export async function formatWeeklyPlan(runtime: IAgentRuntime, userId: UUID): Promise<string> {
  try {
    const weekStartDate = getWeekStartDate(new Date()).toISOString().split('T')[0];
    const cacheKey = `weekly-plan-${userId}-${weekStartDate}`;

    // Try to get this week's plan from cache
    const cachedPlan = await runtime.getCache(cacheKey);

    if (cachedPlan && typeof cachedPlan === 'object' && 'weekOverview' in cachedPlan) {
      const plan = cachedPlan as WeeklyPlan;
      return `This Week's Plan for User (Week of ${weekStartDate}):\n\nOverview: ${plan.weekOverview}\n\nWeekly Goals: ${plan.weeklyGoals}`;
    }

    return '';
  } catch (error) {
    console.error('Error formatting weekly plan:', error);
    return '';
  }
}

/**
 * Store weekly plan for a user
 *
 * @param {IAgentRuntime} runtime - The runtime instance
 * @param {UUID} userId - The user ID
 * @param {any} parsedPlan - The parsed weekly plan data
 * @param {string} weekStartDate - The week start date in YYYY-MM-DD format
 * @returns {Promise<void>}
 */
export async function storeWeeklyPlan(
  runtime: IAgentRuntime,
  userId: UUID,
  parsedPlan: any,
  weekStartDate: string
): Promise<void> {
  try {
    const cacheKey = `weekly-plan-${userId}-${weekStartDate}`;

    const weeklyPlan: WeeklyPlan = {
      userId,
      weekStartDate,
      weekOverview: parsedPlan.weekOverview || '',
      mondayTheme: parsedPlan.mondayTheme || '',
      mondayActivities: parsedPlan.mondayActivities || '',
      tuesdayTheme: parsedPlan.tuesdayTheme || '',
      tuesdayActivities: parsedPlan.tuesdayActivities || '',
      wednesdayTheme: parsedPlan.wednesdayTheme || '',
      wednesdayActivities: parsedPlan.wednesdayActivities || '',
      thursdayTheme: parsedPlan.thursdayTheme || '',
      thursdayActivities: parsedPlan.thursdayActivities || '',
      fridayTheme: parsedPlan.fridayTheme || '',
      fridayActivities: parsedPlan.fridayActivities || '',
      saturdayTheme: parsedPlan.saturdayTheme || '',
      saturdayActivities: parsedPlan.saturdayActivities || '',
      sundayTheme: parsedPlan.sundayTheme || '',
      sundayActivities: parsedPlan.sundayActivities || '',
      weeklyGoals: parsedPlan.weeklyGoals || '',
      successMetrics: parsedPlan.successMetrics || '',
      createdAt: Date.now(),
    };

    await runtime.setCache(cacheKey, weeklyPlan);
  } catch (error) {
    console.error('Error storing weekly plan:', error);
  }
}

/**
 * Get weekly plan for a user
 *
 * @param {IAgentRuntime} runtime - The runtime instance
 * @param {UUID} userId - The user ID
 * @param {string} weekStartDate - The week start date in YYYY-MM-DD format (optional, defaults to current week)
 * @returns {Promise<WeeklyPlan | null>}
 */
export async function getWeeklyPlan(
  runtime: IAgentRuntime,
  userId: UUID,
  weekStartDate?: string
): Promise<WeeklyPlan | null> {
  try {
    const targetWeekStart =
      weekStartDate || getWeekStartDate(new Date()).toISOString().split('T')[0];
    const cacheKey = `weekly-plan-${userId}-${targetWeekStart}`;

    const cachedPlan = await runtime.getCache(cacheKey);

    if (cachedPlan && typeof cachedPlan === 'object' && 'weekOverview' in cachedPlan) {
      return cachedPlan as WeeklyPlan;
    }

    return null;
  } catch (error) {
    console.error('Error getting weekly plan:', error);
    return null;
  }
}

/**
 * Weekly plan provider that adds the user's weekly plan to the context
 */
export const weeklyPlanProvider = {
  name: 'WEEKLY_PLAN',
  description: "Provides the user's weekly plan for relationship growth and connection",
  position: 1,
  get: async (runtime: IAgentRuntime, message: Memory, _state?: State) => {
    try {
      // Get the user ID from the message
      const userId = message.entityId;

      if (!userId) {
        return {
          values: {
            weeklyPlan: '',
            currentDayTheme: '',
          },
          data: {
            weeklyPlan: null,
            currentDayTheme: null,
          },
          text: '',
        };
      }

      // Get this week's plan for the user
      const weeklyPlan = await formatWeeklyPlan(runtime, userId);

      // Get current day's theme from the weekly plan
      const currentDayInfo = await getCurrentDayThemeFromWeeklyPlan(runtime, userId);

      return {
        values: {
          weeklyPlan,
          currentDayTheme: currentDayInfo.theme,
          currentDayActivities: currentDayInfo.activities,
        },
        data: {
          weeklyPlan: await getWeeklyPlan(runtime, userId),
          currentDayTheme: currentDayInfo,
        },
        text: weeklyPlan,
      };
    } catch (error) {
      console.error('Error in weekly plan provider:', error);
      return {
        values: {
          weeklyPlan: '',
          currentDayTheme: '',
        },
        data: {
          weeklyPlan: null,
          currentDayTheme: null,
        },
        text: '',
      };
    }
  },
};

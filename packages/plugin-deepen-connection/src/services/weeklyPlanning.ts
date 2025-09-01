import { type IAgentRuntime, type UUID, Service, logger, ModelType } from '@elizaos/core';
import { weeklyPlanningTemplate } from '../utils/promptTemplates.js';
import { storeWeeklyPlan, formatPreviousWeekPlan } from '../providers/weeklyPlan.js';

/**
 * Weekly Planning Service
 * Generates comprehensive weekly relationship plans for active connections
 * Runs weekly to create structured 7-day relationship enhancement programs
 */
export class WeeklyPlanningService extends Service {
  static serviceType = 'weekly-planning' as const;
  capabilityDescription =
    'Generates comprehensive weekly relationship plans for active connections';

  // Weekly scheduling constants
  private readonly WEEKLY_PLANNING_DAY = 0; // Sunday (0 = Sunday, 1 = Monday, etc.)
  private readonly WEEKLY_PLANNING_HOUR = 20; // 8 PM on Sunday evening
  private readonly PLANNING_MINUTE_WINDOW = 60; // 1-hour window for execution
  private lastWeeklyPlanningDate: string | null = null;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  /**
   * Start the WeeklyPlanningService with the given runtime.
   * @param {IAgentRuntime} runtime - The runtime for the WeeklyPlanningService.
   * @returns {Promise<Service>} A promise that resolves with the WeeklyPlanningService instance.
   */
  static async start(runtime: IAgentRuntime): Promise<Service> {
    const service = new WeeklyPlanningService(runtime);
    await service.registerWeeklyPlanningTask();
    return service;
  }

  /**
   * Register the weekly planning task worker
   */
  async registerWeeklyPlanningTask() {
    // Register the main weekly planning task worker
    this.runtime.registerTaskWorker({
      name: 'WEEKLY_PLANNING',
      validate: async (_runtime, _message, _state) => {
        return this.shouldRunWeeklyPlanning();
      },
      execute: async (runtime, _options) => {
        await this.run(runtime);
      },
    });

    logger.info('[Deepen-Connection] Weekly planning task worker registered');
  }

  async run(runtime: IAgentRuntime): Promise<void> {
    // Check if we should run weekly planning based on schedule
    if (!this.shouldRunWeeklyPlanning()) {
      logger.debug('[Deepen-Connection] Not time for weekly planning yet');
      return;
    }
    logger.info(`[Deepen-Connection] Starting weekly planning service`);

    try {
      // Get active relationships for this agent - simplified for now
      // TODO: Replace with proper relationship fetching from database
      const activeRelationships: any[] = [];

      logger.info(
        `[Deepen-Connection] Found ${activeRelationships.length} relationships to process for weekly planning`
      );

      for (const relationship of activeRelationships) {
        // Check if this relationship is tagged as 'active'
        if (!relationship.tags?.includes('active')) {
          continue;
        }

        try {
          await this.generateWeeklyPlan(runtime, relationship);
        } catch (error: unknown) {
          logger.error(
            `[Deepen-Connection] Error generating weekly plan for relationship ${relationship.id}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // Mark this week as completed
      const currentWeekStart = this.getWeekStartDate(new Date()).toISOString().split('T')[0];
      this.lastWeeklyPlanningDate = currentWeekStart;

      // Store completion status in cache for monitoring
      await runtime.setCache('weekly-planning-last-run', {
        date: new Date().toISOString(),
        weekStartDate: currentWeekStart,
        relationshipsProcessed: activeRelationships.length,
      });

      logger.info(`[Deepen-Connection] Weekly planning service completed`);
    } catch (error: unknown) {
      logger.error(
        `[Deepen-Connection] Error in weekly planning service: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if we should run weekly planning based on schedule
   */
  private shouldRunWeeklyPlanning(): boolean {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentWeekStart = this.getWeekStartDate(now).toISOString().split('T')[0];

    // Check if it's the right day (Sunday)
    if (currentDay !== this.WEEKLY_PLANNING_DAY) {
      return false;
    }

    // Check if it's the right time (8 PM with 1-hour window)
    const isPlanningTime =
      currentHour === this.WEEKLY_PLANNING_HOUR &&
      currentMinutes >= 0 &&
      currentMinutes <= this.PLANNING_MINUTE_WINDOW;

    if (!isPlanningTime) {
      return false;
    }

    // Check if we haven't already planned this week
    const hasNotPlannedThisWeek = this.lastWeeklyPlanningDate !== currentWeekStart;

    logger.debug(
      `[Deepen-Connection] Weekly planning check: Day=${currentDay}, Hour=${currentHour}, Week=${currentWeekStart}, LastPlanned=${this.lastWeeklyPlanningDate}, ShouldRun=${hasNotPlannedThisWeek}`
    );

    return hasNotPlannedThisWeek;
  }

  /**
   * Generate a comprehensive weekly relationship plan for a relationship
   */
  private async generateWeeklyPlan(runtime: IAgentRuntime, relationship: any): Promise<void> {
    logger.info(`[Deepen-Connection] Generating weekly plan for relationship ${relationship.id}`);

    const person1UserId = relationship.sourceEntityId;
    const person2UserId = relationship.targetEntityId;

    // Get current date and week start date
    const currentDate = new Date().toISOString().split('T')[0];
    const weekStartDate = this.getWeekStartDate(new Date()).toISOString().split('T')[0];

    // Get persona memories for both users
    const person1PersonaMemories = await this.getPersonaMemories(runtime, person1UserId);
    const person2PersonaMemories = await this.getPersonaMemories(runtime, person2UserId);

    // Get connection memories for both users
    const person1ConnectionMemories = await this.getConnectionMemories(runtime, person1UserId);
    const person2ConnectionMemories = await this.getConnectionMemories(runtime, person2UserId);

    // Get recent messages for both users (last 48 hours)
    const person1RecentMessages = await this.getRecentMessages(runtime, person1UserId, 48);
    const person2RecentMessages = await this.getRecentMessages(runtime, person2UserId, 48);

    // Get shared relationship context
    const sharedRelationshipContext = await this.getSharedRelationshipContext(
      runtime,
      person1UserId,
      person2UserId
    );

    // Get person names from their user data
    const person1Name = await this.getUserName(runtime, person1UserId);
    const person2Name = await this.getUserName(runtime, person2UserId);

    // Get previous week's plan (try person1 first, fallback to person2)
    let previousWeekPlan = '';
    try {
      const person1PreviousPlan = await formatPreviousWeekPlan(runtime, person1UserId);
      const person2PreviousPlan = await formatPreviousWeekPlan(runtime, person2UserId);

      // Use person1's previous plan if available and meaningful, otherwise person2's
      if (person1PreviousPlan && !person1PreviousPlan.includes('No previous weekly plan')) {
        previousWeekPlan = person1PreviousPlan;
      } else if (person2PreviousPlan && !person2PreviousPlan.includes('No previous weekly plan')) {
        previousWeekPlan = person2PreviousPlan;
      } else {
        previousWeekPlan =
          'No previous weekly plan available. This will be your first structured weekly plan.';
      }
    } catch (error: unknown) {
      logger.error(
        `[Deepen-Connection] Error getting previous week plan: ${error instanceof Error ? error.message : String(error)}`
      );
      previousWeekPlan = 'No previous weekly plan available.';
    }

    // Generate the weekly plan using the template
    const weeklyPlanResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
      prompt: weeklyPlanningTemplate
        .replace(/\{\{person1Name\}\}/g, person1Name)
        .replace(/\{\{person2Name\}\}/g, person2Name)
        .replace(/\{\{person1UserId\}\}/g, person1UserId)
        .replace(/\{\{person2UserId\}\}/g, person2UserId)
        .replace(/\{\{person1PersonaMemories\}\}/g, person1PersonaMemories)
        .replace(/\{\{person1ConnectionMemories\}\}/g, person1ConnectionMemories)
        .replace(/\{\{person1RecentMessages\}\}/g, person1RecentMessages)
        .replace(/\{\{person2PersonaMemories\}\}/g, person2PersonaMemories)
        .replace(/\{\{person2ConnectionMemories\}\}/g, person2ConnectionMemories)
        .replace(/\{\{person2RecentMessages\}\}/g, person2RecentMessages)
        .replace(/\{\{sharedRelationshipContext\}\}/g, sharedRelationshipContext)
        .replace(/\{\{previousWeekPlan\}\}/g, previousWeekPlan)
        .replace(/\{\{currentDate\}\}/g, currentDate)
        .replace(/\{\{weekStartDate\}\}/g, weekStartDate),
    });

    if (!weeklyPlanResponse) {
      logger.error(
        `[Deepen-Connection] Empty response from weekly planning template for relationship ${relationship.id}`
      );
      return;
    }

    // Parse the weekly plan response
    const parsedPlan = this.parseWeeklyPlanResponse(weeklyPlanResponse);

    if (!parsedPlan) {
      logger.error(
        `[Deepen-Connection] Failed to parse weekly plan response for relationship ${relationship.id}`
      );
      return;
    }

    // Store weekly plans for both users (similar to daily plans)
    await storeWeeklyPlan(runtime, person1UserId, parsedPlan, weekStartDate);
    await storeWeeklyPlan(runtime, person2UserId, parsedPlan, weekStartDate);

    logger.info(
      `[Deepen-Connection] Successfully generated and saved weekly plan for relationship ${relationship.id}`
    );
  }

  /**
   * Get the start date of the current week (Monday)
   */
  private getWeekStartDate(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(d.setDate(diff));
  }

  /**
   * Get persona memories for a user
   */
  private async getPersonaMemories(runtime: IAgentRuntime, userId: UUID): Promise<string> {
    try {
      const memories = await runtime.getMemories({
        tableName: 'memories',
        entityId: userId,
        count: 20,
        unique: false,
      });

      const personaMemories = memories
        .filter((m) => m.metadata && (m.metadata as any).type === 'persona_memory')
        .slice(0, 10)
        .map((m) => m.content.text)
        .filter((text) => text)
        .join('\n');

      return personaMemories || 'No persona memories found';
    } catch (error: unknown) {
      logger.error(
        `[Deepen-Connection] Error fetching persona memories for user ${userId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return 'Error fetching persona memories';
    }
  }

  /**
   * Get connection memories for a user
   */
  private async getConnectionMemories(runtime: IAgentRuntime, userId: UUID): Promise<string> {
    try {
      const memories = await runtime.getMemories({
        tableName: 'memories',
        entityId: userId,
        count: 20,
        unique: false,
      });

      const connectionMemories = memories
        .filter((m) => m.metadata && (m.metadata as any).type === 'connection_memory')
        .slice(0, 10)
        .map((m) => m.content.text)
        .filter((text) => text)
        .join('\n');

      return connectionMemories || 'No connection memories found';
    } catch (error: unknown) {
      logger.error(
        `[Deepen-Connection] Error fetching connection memories for user ${userId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return 'Error fetching connection memories';
    }
  }

  /**
   * Get recent messages for a user within specified hours
   */
  private async getRecentMessages(
    runtime: IAgentRuntime,
    userId: UUID,
    hours: number
  ): Promise<string> {
    try {
      const memories = await runtime.getMemories({
        tableName: 'memories',
        entityId: userId,
        count: 50,
        unique: false,
      });

      const hoursAgo = new Date(Date.now() - hours * 60 * 60 * 1000);

      const recentMessages = memories
        .filter((m) => {
          const createdAt = new Date(m.createdAt || 0);
          return createdAt > hoursAgo;
        })
        .slice(0, 20)
        .map((m) => m.content.text)
        .filter((text) => text)
        .join('\n');

      return recentMessages || `No messages found in last ${hours} hours`;
    } catch (error: unknown) {
      logger.error(
        `[Deepen-Connection] Error fetching recent messages for user ${userId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return 'Error fetching recent messages';
    }
  }

  /**
   * Get shared relationship context from saved memories
   */
  private async getSharedRelationshipContext(
    runtime: IAgentRuntime,
    person1UserId: UUID,
    person2UserId: UUID
  ): Promise<string> {
    try {
      // Get shared relationship memories for both users
      const person1Context = await this.getSharedRelationshipMemoriesForUser(
        runtime,
        person1UserId
      );
      const person2Context = await this.getSharedRelationshipMemoriesForUser(
        runtime,
        person2UserId
      );

      // Combine contexts if both exist
      if (person1Context && person2Context) {
        return `${person1Context}\n\n${person2Context}`;
      } else if (person1Context) {
        return person1Context;
      } else if (person2Context) {
        return person2Context;
      } else {
        return 'No shared relationship context available';
      }
    } catch (error: unknown) {
      logger.error(
        `[Deepen-Connection] Error fetching shared relationship context: ${error instanceof Error ? error.message : String(error)}`
      );
      return 'Error fetching shared relationship context';
    }
  }

  /**
   * Get shared relationship memories for a specific user
   */
  private async getSharedRelationshipMemoriesForUser(
    runtime: IAgentRuntime,
    userId: UUID
  ): Promise<string> {
    try {
      const singleValueTypes = ['shared_relationship_stage', 'shared_relationship_length'];
      const multiValueTypes = [
        'shared_relationship_dynamic',
        'shared_relationship_pattern',
        'shared_relationship_Patterns', // Active challenges
        'shared_relationship_goals',
        'shared_relationship_cultural_context',
      ];

      const contextParts: string[] = [];

      // Fetch single value memories
      for (const type of singleValueTypes) {
        const memories = await runtime.getMemories({
          tableName: 'memories',
          entityId: userId,
          count: 10,
          unique: false,
        });

        const filteredMemories = memories.filter(
          (m) => m.metadata && (m.metadata as any).type === type
        );

        if (filteredMemories.length > 0 && filteredMemories[0].content.text) {
          const value = filteredMemories[0].content.text;

          switch (type) {
            case 'shared_relationship_stage':
              contextParts.push(`Relationship Stage: ${value}`);
              break;
            case 'shared_relationship_length':
              contextParts.push(`Relationship Length: ${value} months`);
              break;
          }
        }
      }

      // Fetch last 3 memories for multi-value types
      for (const type of multiValueTypes) {
        const memories = await runtime.getMemories({
          tableName: 'memories',
          entityId: userId,
          count: 20,
          unique: false,
        });

        const filteredMemories = memories
          .filter((m) => m.metadata && (m.metadata as any).type === type)
          .slice(0, 3);

        if (filteredMemories.length > 0) {
          const values = filteredMemories
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .map((m) => m.content.text)
            .filter((text) => text);

          if (values.length > 0) {
            const formattedValues = values.join('; ');

            switch (type) {
              case 'shared_relationship_dynamic':
                contextParts.push(`Current Dynamics (recent): ${formattedValues}`);
                break;
              case 'shared_relationship_pattern':
                contextParts.push(`Recent Patterns: ${formattedValues}`);
                break;
              case 'shared_relationship_Patterns': // Active challenges
                contextParts.push(`Active Challenges: ${formattedValues}`);
                break;
              case 'shared_relationship_goals':
                contextParts.push(`Shared Goals: ${formattedValues}`);
                break;
              case 'shared_relationship_cultural_context':
                contextParts.push(`Cultural Context: ${formattedValues}`);
                break;
            }
          }
        }
      }

      return contextParts.length > 0 ? contextParts.join('\n') : '';
    } catch (error: unknown) {
      logger.error(
        `[Deepen-Connection] Error fetching shared relationship memories for user ${userId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return '';
    }
  }

  /**
   * Get user name from memories or default
   */
  private async getUserName(runtime: IAgentRuntime, userId: UUID): Promise<string> {
    try {
      const memories = await runtime.getMemories({
        tableName: 'memories',
        entityId: userId,
        count: 10,
        unique: false,
      });

      // Look for name in persona memories
      const nameMemory = memories.find(
        (m) =>
          m.content.text?.toLowerCase().includes('my name is') ||
          m.content.text?.toLowerCase().includes('i am ') ||
          m.content.text?.toLowerCase().includes('call me ')
      );

      if (nameMemory && nameMemory.content.text) {
        // Extract name from memory text (simple extraction)
        const text = nameMemory.content.text.toLowerCase();
        if (text.includes('my name is ')) {
          const name = text.split('my name is ')[1]?.split(/[,.\s]/)[0];
          if (name) return name.charAt(0).toUpperCase() + name.slice(1);
        }
        if (text.includes('i am ')) {
          const name = text.split('i am ')[1]?.split(/[,.\s]/)[0];
          if (name) return name.charAt(0).toUpperCase() + name.slice(1);
        }
        if (text.includes('call me ')) {
          const name = text.split('call me ')[1]?.split(/[,.\s]/)[0];
          if (name) return name.charAt(0).toUpperCase() + name.slice(1);
        }
      }

      // Default to User + last 4 chars of UUID
      return `User${userId.slice(-4)}`;
    } catch (error: unknown) {
      logger.error(
        `[Deepen-Connection] Error getting user name for ${userId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return `User${userId.slice(-4)}`;
    }
  }

  /**
   * Parse the weekly plan response from the LLM
   */
  private parseWeeklyPlanResponse(response: string): any | null {
    try {
      // Extract the XML response
      const responseMatch = response.match(/<response>([\s\S]*?)<\/response>/);
      if (!responseMatch) {
        logger.error('[Deepen-Connection] No valid XML response found in weekly plan response');
        return null;
      }

      const xmlContent = responseMatch[1];

      // Parse each field
      const fields = [
        'weekOverview',
        'mondayTheme',
        'mondayActivities',
        'tuesdayTheme',
        'tuesdayActivities',
        'wednesdayTheme',
        'wednesdayActivities',
        'thursdayTheme',
        'thursdayActivities',
        'fridayTheme',
        'fridayActivities',
        'saturdayTheme',
        'saturdayActivities',
        'sundayTheme',
        'sundayActivities',
        'weeklyGoals',
        'successMetrics',
      ];

      const parsed: any = {};

      for (const field of fields) {
        const fieldMatch = xmlContent.match(new RegExp(`<${field}>([\s\S]*?)<\/${field}>`));
        if (fieldMatch) {
          parsed[field] = fieldMatch[1].trim();
        }
      }

      // Validate required fields
      if (!parsed.weekOverview || !parsed.mondayTheme || !parsed.weeklyGoals) {
        logger.error('[Deepen-Connection] Missing required fields in weekly plan response');
        return null;
      }

      return parsed;
    } catch (error: unknown) {
      logger.error(
        `[Deepen-Connection] Error parsing weekly plan response: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Stop the service
   */
  async stop() {
    logger.debug('[Deepen-Connection] WeeklyPlanningService stopped');
  }
}

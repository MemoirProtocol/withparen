import {
  logger,
  Service,
  type IAgentRuntime,
  type UUID,
  type Content,
  ModelType,
} from '@elizaos/core';
import { MemgraphService } from './memgraph.js';
import { dailyPlanningTemplate, relationshipProfilingTemplate } from '../utils/promptTemplates.js';
import { storeDailyPlan } from '../providers/dailyPlan.js';
import { formatPersonaMemories } from '../providers/personaMemory.js';
import { formatConnectionMemories } from '../providers/connectionMemory.js';
import { getCurrentDayThemeFromWeeklyPlan } from '../providers/weeklyPlan.js';

/**
 * DailyPlanningService class for generating daily plans and scheduling check-ins
 */
export class DailyPlanningService extends Service {
  static serviceType = 'daily-planning' as const;
  capabilityDescription =
    'Generates daily plans and schedules personalized check-ins for relationship partners';

  private readonly PLANNING_HOUR = 6; // 6 AM for daily planning
  private readonly CHECKIN_HOUR = 11; // 12 PM (noon) for check-ins
  private readonly PLANNING_MINUTE_WINDOW = 30; // 30-minute window for execution
  private lastPlanningDate: string | null = null;
  private memgraphService: MemgraphService;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    this.memgraphService = new MemgraphService();
  }

  /**
   * Start the DailyPlanningService with the given runtime.
   * @param {IAgentRuntime} runtime - The runtime for the DailyPlanningService.
   * @returns {Promise<Service>} A promise that resolves with the DailyPlanningService instance.
   */
  static async start(runtime: IAgentRuntime): Promise<Service> {
    const service = new DailyPlanningService(runtime);
    await service.registerDailyPlanningTask();
    return service;
  }

  /**
   * Register the daily planning task worker
   */
  async registerDailyPlanningTask() {
    // Register the main daily planning task worker
    this.runtime.registerTaskWorker({
      name: 'DAILY_PLANNING',
      validate: async (_runtime, _message, _state) => {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const today = now.toISOString().split('T')[0]; // YYYY-MM-DD format

        // Check if it's the right time (6 AM with a window)
        const isPlanningTime =
          hour === this.PLANNING_HOUR && minute >= 0 && minute <= this.PLANNING_MINUTE_WINDOW;

        // Check if we haven't already planned today
        const hasNotPlannedToday = this.lastPlanningDate !== today;

        if (isPlanningTime && hasNotPlannedToday) {
          logger.debug(
            '[Deepen-Connection] Daily planning validation: It is planning time and planning not done today, task should run'
          );
          return true;
        }

        return false;
      },
      execute: async (runtime, _options) => {
        const today = new Date().toISOString().split('T')[0];
        await this.executeDailyPlanning(runtime);
        // Mark today as completed
        this.lastPlanningDate = today;
      },
    });

    // Register the individual daily planning task worker
    this.runtime.registerTaskWorker({
      name: 'DAILY_PLANNING_TASK',
      validate: async (_runtime, _message, _state) => {
        // This task is created dynamically and should always execute when queued
        return true;
      },
      execute: async (runtime, _options, task) => {
        if (task?.metadata?.connectionData) {
          await this.executeSingleConnectionPlanning(runtime, task.metadata.connectionData);
        }
      },
    });

    // Register the daily check-in task worker
    this.runtime.registerTaskWorker({
      name: 'DAILY_CHECKIN_TASK',
      validate: async (_runtime, _message, _state, task) => {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();

        // Get the personalized check-in hour from task metadata, or use default
        const targetHour = (task?.metadata?.checkInHour as number) ?? this.CHECKIN_HOUR;

        // Check if it's the right time with a window
        const isCheckinTime =
          hour === targetHour && minute >= 0 && minute <= this.PLANNING_MINUTE_WINDOW;

        if (isCheckinTime) {
          logger.debug(
            `[Deepen-Connection] Check-in time validation: It is check-in time (${targetHour}:00 UTC) for user ${task?.metadata?.userId || 'unknown'}`
          );
        }

        return isCheckinTime;
      },
      execute: async (runtime, _options, task) => {
        if (task?.metadata?.userId && task?.metadata?.checkInMessage) {
          await this.sendPersonalizedCheckin(
            runtime,
            task.metadata.userId as UUID,
            task.metadata.checkInMessage as string
          );
        }
      },
    });

    // Check if the daily planning task exists, if not create it
    const existingTasks = await this.runtime.getTasksByName('DAILY_PLANNING');

    if (existingTasks.length === 0) {
      // Get the first available world ID for task creation
      let worldId: UUID;
      try {
        const worlds = await this.runtime.getAllWorlds();
        if (worlds.length > 0) {
          worldId = worlds[0].id;
        } else {
          // Use default world ID if no worlds exist
          worldId = '00000000-0000-0000-0000-000000000000' as UUID;
        }
      } catch (error) {
        logger.warn('[Deepen-Connection] Using default world for daily planning task creation');
        worldId = '00000000-0000-0000-0000-000000000000' as UUID;
      }

      await this.runtime.createTask({
        name: 'DAILY_PLANNING',
        description:
          'Daily planning task that generates plans and schedules check-ins for all active connections',
        worldId: worldId,
        metadata: {
          updatedAt: Date.now(),
          updateInterval: 1000 * 60 * 60, // Check every hour
        },
        tags: ['queue', 'repeat', 'daily-planning'],
      });
      logger.info('[Deepen-Connection] Created daily planning task');
    }
  }

  /**
   * Execute the daily planning by finding active connections and queuing individual planning tasks
   */
  async executeDailyPlanning(runtime: IAgentRuntime) {
    try {
      logger.info('[Deepen-Connection] Executing daily planning task');

      // Connect to Memgraph
      await this.memgraphService.connect();

      // Get all active HumanConnection nodes with exactly two participants
      const activeConnections = await this.memgraphService.getActiveHumanConnections();

      logger.info(
        `[Deepen-Connection] Found ${activeConnections.length} active connections for daily planning`
      );

      // Get the first available world ID for task creation
      let worldId: UUID;
      try {
        const worlds = await runtime.getAllWorlds();
        if (worlds.length > 0) {
          worldId = worlds[0].id;
        } else {
          worldId = '00000000-0000-0000-0000-000000000000' as UUID;
        }
      } catch (error) {
        logger.warn('[Deepen-Connection] Using default world for daily planning task creation');
        worldId = '00000000-0000-0000-0000-000000000000' as UUID;
      }

      // Queue individual planning tasks for each connection
      for (const connectionData of activeConnections) {
        try {
          await runtime.createTask({
            name: 'DAILY_PLANNING_TASK',
            description: `Daily planning task for connection between ${connectionData.participants[0].name} and ${connectionData.participants[1].name}`,
            worldId: worldId,
            metadata: {
              updatedAt: Date.now(),
              connectionData: connectionData,
            },
            tags: ['queue', 'daily-planning-individual'],
          });

          logger.debug(
            `[Deepen-Connection] Queued planning task for connection: ${connectionData.connection.partners.join(' & ')}`
          );
        } catch (error: unknown) {
          logger.error(
            `[Deepen-Connection] Failed to queue planning task for connection: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // Store completion status in cache for monitoring
      await runtime.setCache('daily-planning-last-run', {
        date: new Date().toISOString(),
        connectionsProcessed: activeConnections.length,
      });
    } catch (error: unknown) {
      logger.error(
        `[Deepen-Connection] Error in daily planning task execution: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      await this.memgraphService.disconnect();
    }
  }

  /**
   * Execute planning for a single connection
   */
  async executeSingleConnectionPlanning(runtime: IAgentRuntime, connectionData: any) {
    try {
      const { participants } = connectionData;

      if (participants.length !== 2) {
        logger.warn(
          '[Deepen-Connection] Connection does not have exactly 2 participants, skipping'
        );
        return;
      }

      const person1 = participants[0];
      const person2 = participants[1];

      logger.info(`[Deepen-Connection] Starting planning for ${person1.name} and ${person2.name}`);

      // First, profile the relationship and save as memories
      logger.debug('[Deepen-Connection] Profiling relationship before daily planning');
      const profileData = await this.profileRelationship(
        runtime,
        person1.userId as UUID,
        person2.userId as UUID
      );

      if (profileData) {
        logger.info(
          `[Deepen-Connection] Relationship profile completed: Stage=${profileData.relationshipStage}, Length=${profileData.relationshipLength} months`
        );
      } else {
        logger.warn(
          '[Deepen-Connection] Relationship profiling failed, continuing with daily planning'
        );
      }

      logger.info(
        `[Deepen-Connection] Generating daily plans for ${person1.name} and ${person2.name}`
      );

      // Get comprehensive context for both participants
      const person1PersonaMemories = await this.getPersonaMemories(runtime, person1.userId as UUID);
      const person1ConnectionMemories = await this.getConnectionMemories(
        runtime,
        person1.userId as UUID
      );
      const person1RecentMessages = await this.getRecentMessages(runtime, person1.userId as UUID);
      const person1PreviousPlan = await this.getPreviousDailyPlan(runtime, person1.userId as UUID);

      const person2PersonaMemories = await this.getPersonaMemories(runtime, person2.userId as UUID);
      const person2ConnectionMemories = await this.getConnectionMemories(
        runtime,
        person2.userId as UUID
      );
      const person2RecentMessages = await this.getRecentMessages(runtime, person2.userId as UUID);
      const person2PreviousPlan = await this.getPreviousDailyPlan(runtime, person2.userId as UUID);

      // Get shared relationship context from saved memories
      const sharedRelationshipContext = await this.getSharedRelationshipContext(
        runtime,
        person1.userId as UUID,
        person2.userId as UUID
      );

      // Get current day's theme from weekly plan (try person1 first, fallback to person2, then default)
      let dailyTheme = '';
      try {
        const person1DayTheme = await getCurrentDayThemeFromWeeklyPlan(
          runtime,
          person1.userId as UUID
        );
        const person2DayTheme = await getCurrentDayThemeFromWeeklyPlan(
          runtime,
          person2.userId as UUID
        );

        // Use person1's theme if available, otherwise person2's, otherwise default
        if (person1DayTheme.theme) {
          dailyTheme = `${person1DayTheme.theme}${person1DayTheme.activities ? '\n\nSuggested Activities: ' + person1DayTheme.activities : ''}`;
        } else if (person2DayTheme.theme) {
          dailyTheme = `${person2DayTheme.theme}${person2DayTheme.activities ? '\n\nSuggested Activities: ' + person2DayTheme.activities : ''}`;
        } else {
          // Default theme based on day of week
          const dayOfWeek = new Date().getDay();
          const defaultThemes = [
            'Reflection Sunday - Integration & Future Visioning',
            'Fresh Start Monday - Realignment & Goal Setting',
            'Gratitude Tuesday - Fondness & Admiration Building',
            'Connection Wednesday - Bids & Emotional Attunement',
            'Growth Thursday - Self-Expansion & Novel Experiences',
            'Intimacy Friday - Vulnerability & Deep Connection',
            'Adventure Saturday - Shared Experiences & Fun',
          ];
          dailyTheme = defaultThemes[dayOfWeek] || 'Connection & Growth';
        }
      } catch (error: unknown) {
        logger.error(
          `[Deepen-Connection] Error getting daily theme from weekly plan: ${error instanceof Error ? error.message : String(error)}`
        );
        dailyTheme = 'Connection & Growth';
      }

      // Prepare the enhanced prompt with full context
      const currentDate = new Date().toLocaleDateString();
      const prompt = dailyPlanningTemplate
        .replace('{{dailyTheme}}', dailyTheme)
        .replace('{{person1Name}}', person1.name || 'Person 1')
        .replace('{{person1UserId}}', person1.userId)
        .replace('{{person1PersonaMemories}}', person1PersonaMemories)
        .replace('{{person1ConnectionMemories}}', person1ConnectionMemories)
        .replace('{{person1RecentMessages}}', person1RecentMessages)
        .replace('{{person1PreviousPlan}}', person1PreviousPlan)
        .replace('{{person2Name}}', person2.name || 'Person 2')
        .replace('{{person2UserId}}', person2.userId)
        .replace('{{person2PersonaMemories}}', person2PersonaMemories)
        .replace('{{person2ConnectionMemories}}', person2ConnectionMemories)
        .replace('{{person2RecentMessages}}', person2RecentMessages)
        .replace('{{person2PreviousPlan}}', person2PreviousPlan)
        .replace('{{sharedRelationshipContext}}', sharedRelationshipContext)
        .replace('{{currentDate}}', currentDate);

      // Generate the daily plans using the runtime's model
      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: prompt,
      });

      // Parse the response
      const planningResult = this.parsePlanningResponse(response);

      if (planningResult) {
        // Store daily plans
        await storeDailyPlan(runtime, person1.userId as UUID, planningResult.person1Plan);
        await storeDailyPlan(runtime, person2.userId as UUID, planningResult.person2Plan);

        // Schedule check-in tasks for both participants
        await this.scheduleCheckinTasks(
          runtime,
          person1.userId as UUID,
          planningResult.person1CheckIn,
          planningResult.person1CheckInTimeUTC
        );
        await this.scheduleCheckinTasks(
          runtime,
          person2.userId as UUID,
          planningResult.person2CheckIn,
          planningResult.person2CheckInTimeUTC
        );

        logger.info(
          `[Deepen-Connection] Successfully generated daily plans and scheduled check-ins for ${person1.name} and ${person2.name}`
        );
      } else {
        logger.error('[Deepen-Connection] Failed to parse planning response');
      }
    } catch (error: unknown) {
      logger.error(
        `[Deepen-Connection] Error in single connection planning: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get persona memories for a user
   */
  private async getPersonaMemories(runtime: IAgentRuntime, userId: UUID): Promise<string> {
    try {
      // Use the same dimension tables as the persona memory provider
      const personaDimensions = [
        'persona_demographic',
        'persona_characteristic',
        'persona_routine',
        'persona_goal',
        'persona_experience',
        'persona_persona_relationship',
        'persona_emotional_state',
      ];

      // Get memories from all persona dimensions - now using correct entityId (userId)
      const personaMemoryPromises = personaDimensions.map(async (tableName) => {
        try {
          const memories = await runtime.getMemories({
            tableName,
            entityId: userId, // Now correctly using userId since memories are stored with user's entityId
            count: 3, // Get top 3 from each dimension
            unique: false,
          });
          logger.debug(
            `[Deepen-Connection] Found ${memories.length} memories in ${tableName} for user ${userId}`
          );
          return memories;
        } catch (error: unknown) {
          logger.warn(
            `[Deepen-Connection] Failed to get memories from ${tableName}: ${error instanceof Error ? error.message : String(error)}`
          );
          return [];
        }
      });

      const personaMemoryResults = await Promise.all(personaMemoryPromises);

      // Flatten and deduplicate all persona memories
      const allPersonaMemories = personaMemoryResults
        .flat()
        .filter((memory, index, self) => index === self.findIndex((t) => t.id === memory.id))
        .slice(0, 15); // Limit to top 15 most relevant

      logger.debug(
        `[Deepen-Connection] Total persona memories found for user ${userId}: ${allPersonaMemories.length}`
      );

      if (allPersonaMemories.length === 0) {
        return 'No persona memories available.';
      }

      return formatPersonaMemories(allPersonaMemories);
    } catch (error: unknown) {
      logger.error(
        `[Deepen-Connection] Error getting persona memories for ${userId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return 'No persona memories available.';
    }
  }

  /**
   * Get connection memories for a user
   */
  private async getConnectionMemories(runtime: IAgentRuntime, userId: UUID): Promise<string> {
    try {
      // Use the same dimension tables as the connection memory provider
      const connectionDimensions = [
        'connection_profile',
        'connection_routine',
        'connection_goal',
        'connection_experience',
        'connection_communication',
        'connection_emotion',
      ];

      // Get memories from all connection dimensions - now using correct entityId (userId)
      const connectionMemoryPromises = connectionDimensions.map(async (tableName) => {
        try {
          const memories = await runtime.getMemories({
            tableName,
            entityId: userId, // Now correctly using userId since memories are stored with user's entityId
            count: 3, // Get top 3 from each dimension
            unique: false,
          });
          logger.debug(
            `[Deepen-Connection] Found ${memories.length} memories in ${tableName} for user ${userId}`
          );
          return memories;
        } catch (error: unknown) {
          logger.warn(
            `[Deepen-Connection] Failed to get memories from ${tableName}: ${error instanceof Error ? error.message : String(error)}`
          );
          return [];
        }
      });

      const connectionMemoryResults = await Promise.all(connectionMemoryPromises);

      // Flatten and deduplicate all connection memories
      const allConnectionMemories = connectionMemoryResults
        .flat()
        .filter((memory, index, self) => index === self.findIndex((t) => t.id === memory.id))
        .slice(0, 12); // Limit to top 12 most relevant

      logger.debug(
        `[Deepen-Connection] Total connection memories found for user ${userId}: ${allConnectionMemories.length}`
      );

      if (allConnectionMemories.length === 0) {
        return 'No connection insights available.';
      }

      return formatConnectionMemories(allConnectionMemories);
    } catch (error) {
      logger.error(
        `[Deepen-Connection] Error getting connection memories for ${userId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return 'No connection insights available.';
    }
  }

  /**
   * Get recent messages for a user (last 24 hours)
   */
  private async getRecentMessages(runtime: IAgentRuntime, userId: UUID): Promise<string> {
    try {
      // Calculate 24 hours ago
      const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;

      // Get recent messages from the user's room (assuming roomId = userId for DMs)
      const memories = await runtime.getMemories({
        tableName: 'messages',
        roomId: userId, // Assuming DM room ID matches user ID
        count: 50, // Get more messages to filter by time
        unique: false,
      });

      // Filter messages from the last 24 hours and format them
      const recentMessages = memories
        .filter((memory) => memory.createdAt && memory.createdAt >= twentyFourHoursAgo)
        .slice(0, 20) // Limit to last 20 messages
        .map((memory) => {
          const timestamp = new Date(memory.createdAt || Date.now()).toLocaleTimeString();
          const sender = memory.entityId === runtime.agentId ? 'Deepen-Connection' : 'User';
          return `[${timestamp}] ${sender}: ${memory.content.text || ''}`;
        })
        .join('\n');

      return recentMessages || 'No recent messages in the last 24 hours.';
    } catch (error) {
      logger.error(
        `[Deepen-Connection] Error getting recent messages for ${userId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return 'No recent conversation history available.';
    }
  }

  /**
   * Get previous daily plan for a user (yesterday's plan)
   */
  private async getPreviousDailyPlan(runtime: IAgentRuntime, userId: UUID): Promise<string> {
    try {
      // Calculate yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD format

      const cacheKey = `daily-plan-${userId}-${yesterdayStr}`;
      const cachedPlan = await runtime.getCache(cacheKey);

      if (cachedPlan && typeof cachedPlan === 'object' && 'plan' in cachedPlan) {
        return `Yesterday's Plan:\n${cachedPlan.plan}`;
      }

      return 'No previous daily plan available.';
    } catch (error) {
      logger.error(
        `[Deepen-Connection] Error getting previous daily plan for ${userId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return 'No previous daily plan available.';
    }
  }

  /**
   * Parse the planning response from the LLM
   */
  private parsePlanningResponse(response: string): {
    person1Plan: string;
    person1CheckIn: string;
    person1CheckInTimeUTC?: number;
    person2Plan: string;
    person2CheckIn: string;
    person2CheckInTimeUTC?: number;
  } | null {
    try {
      // Extract content between <response> tags
      const responseMatch = response.match(/<response>([\s\S]*?)<\/response>/);
      if (!responseMatch) {
        logger.error('[Deepen-Connection] No response tags found in planning response');
        return null;
      }

      const responseContent = responseMatch[1];

      // Extract individual fields
      const person1PlanMatch = responseContent.match(/<person1Plan>([\s\S]*?)<\/person1Plan>/);
      const person1CheckInMatch = responseContent.match(
        /<person1CheckIn>([\s\S]*?)<\/person1CheckIn>/
      );
      const person1CheckInTimeMatch = responseContent.match(
        /<person1CheckInTimeUTC>([\s\S]*?)<\/person1CheckInTimeUTC>/
      );
      const person2PlanMatch = responseContent.match(/<person2Plan>([\s\S]*?)<\/person2Plan>/);
      const person2CheckInMatch = responseContent.match(
        /<person2CheckIn>([\s\S]*?)<\/person2CheckIn>/
      );
      const person2CheckInTimeMatch = responseContent.match(
        /<person2CheckInTimeUTC>([\s\S]*?)<\/person2CheckInTimeUTC>/
      );

      if (!person1PlanMatch || !person1CheckInMatch || !person2PlanMatch || !person2CheckInMatch) {
        logger.error('[Deepen-Connection] Missing required fields in planning response');
        return null;
      }

      // Parse check-in times (optional fields with validation)
      let person1CheckInTimeUTC: number | undefined;
      let person2CheckInTimeUTC: number | undefined;

      if (person1CheckInTimeMatch) {
        const time = parseInt(person1CheckInTimeMatch[1].trim());
        if (!isNaN(time) && time >= 0 && time <= 23) {
          person1CheckInTimeUTC = time;
        } else {
          logger.warn(
            `[Deepen-Connection] Invalid person1 check-in time: ${person1CheckInTimeMatch[1].trim()}, using default`
          );
        }
      }

      if (person2CheckInTimeMatch) {
        const time = parseInt(person2CheckInTimeMatch[1].trim());
        if (!isNaN(time) && time >= 0 && time <= 23) {
          person2CheckInTimeUTC = time;
        } else {
          logger.warn(
            `[Deepen-Connection] Invalid person2 check-in time: ${person2CheckInTimeMatch[1].trim()}, using default`
          );
        }
      }

      return {
        person1Plan: person1PlanMatch[1].trim(),
        person1CheckIn: person1CheckInMatch[1].trim(),
        person1CheckInTimeUTC,
        person2Plan: person2PlanMatch[1].trim(),
        person2CheckIn: person2CheckInMatch[1].trim(),
        person2CheckInTimeUTC,
      };
    } catch (error: unknown) {
      logger.error(
        `[Deepen-Connection] Error parsing planning response: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Schedule check-in tasks for a user
   */
  private async scheduleCheckinTasks(
    runtime: IAgentRuntime,
    userId: UUID,
    checkInMessage: string,
    checkInHour?: number
  ) {
    try {
      // Get the first available world ID for task creation
      let worldId: UUID;
      try {
        const worlds = await runtime.getAllWorlds();
        if (worlds.length > 0) {
          worldId = worlds[0].id;
        } else {
          worldId = '00000000-0000-0000-0000-000000000000' as UUID;
        }
      } catch (error) {
        logger.warn('[Deepen-Connection] Using default world for check-in task creation');
        worldId = '00000000-0000-0000-0000-000000000000' as UUID;
      }

      await runtime.createTask({
        name: 'DAILY_CHECKIN_TASK',
        description: `Daily check-in task for user ${userId}${checkInHour !== undefined ? ` at ${checkInHour}:00 UTC` : ''}`,
        worldId: worldId,
        metadata: {
          updatedAt: Date.now(),
          userId: userId,
          checkInMessage: checkInMessage,
          checkInHour: checkInHour, // Store the personalized check-in hour
        },
        tags: ['queue', 'daily-checkin-individual'],
      });

      logger.debug(
        `[Deepen-Connection] Scheduled check-in task for user: ${userId}${checkInHour !== undefined ? ` at ${checkInHour}:00 UTC` : ' (default time)'}`
      );
    } catch (error: unknown) {
      logger.error(
        `[Deepen-Connection] Failed to schedule check-in task for user ${userId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Send personalized check-in message to a user
   */
  private async sendPersonalizedCheckin(
    runtime: IAgentRuntime,
    userId: UUID,
    checkInMessage: string
  ) {
    try {
      const roomId = userId; // Assuming roomId is same as userId for DMs

      const checkInContent: Content = {
        text: checkInMessage,
        actions: ['NONE'],
        simple: true,
      };

      // Create a memory for the check-in message
      const checkInMemory = {
        id: runtime.createRunId(),
        entityId: runtime.agentId,
        agentId: runtime.agentId,
        content: checkInContent,
        roomId: roomId,
        createdAt: Date.now(),
      };

      // Save the message to memory first
      await runtime.createMemory(checkInMemory, 'messages');

      // Get the room to determine the source and send the message
      const room = await runtime.getRoom(roomId);
      if (room && room.source) {
        try {
          // Use the sendMessageToTarget method to send the message
          await runtime.sendMessageToTarget(
            {
              source: room.source,
              roomId: roomId,
            },
            checkInContent
          );

          logger.debug(
            `[Deepen-Connection] Personalized check-in sent successfully to user: ${userId} (${room.source})`
          );
        } catch (sendError: unknown) {
          // If direct sending fails, try emitting an event
          logger.debug(
            `[Deepen-Connection] Direct send failed for user ${userId}, trying event emission: ${sendError instanceof Error ? sendError.message : String(sendError)}`
          );

          try {
            // Emit a message event that the message handlers can pick up
            await runtime.emitEvent('new_message', {
              runtime,
              message: checkInMemory,
              roomId: roomId,
              source: 'daily-checkin',
            });

            logger.debug(`[Deepen-Connection] Check-in event emitted for user: ${userId}`);
          } catch (eventError: unknown) {
            logger.warn(
              `[Deepen-Connection] Event emission also failed for user ${userId}: ${eventError instanceof Error ? eventError.message : String(eventError)}`
            );
          }
        }
      } else {
        logger.warn(`[Deepen-Connection] Room ${roomId} not found or has no source`);
      }
    } catch (error: unknown) {
      logger.error(
        `[Deepen-Connection] Error sending personalized check-in to user ${userId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Manual trigger for testing daily planning (bypasses time validation)
   */
  async triggerTestPlanning() {
    logger.info('[Deepen-Connection] Manually triggering daily planning for testing');
    await this.executeDailyPlanning(this.runtime);
  }

  /**
   * Get the last planning status from cache
   */
  async getLastPlanningStatus() {
    return await this.runtime.getCache('daily-planning-last-run');
  }

  /**
   * Profile a relationship and save results as memories
   */
  async profileRelationship(
    runtime: IAgentRuntime,
    person1Id: UUID,
    person2Id: UUID
  ): Promise<any> {
    try {
      logger.debug(
        `[Deepen-Connection] Profiling relationship between ${person1Id} and ${person2Id}`
      );

      // Get conversation histories for both partners
      const partner1History = await this.getConversationHistory(runtime, person1Id);
      const partner2History = await this.getConversationHistory(runtime, person2Id);

      if (!partner1History || !partner2History) {
        logger.warn('[Deepen-Connection] Insufficient conversation history for profiling');
        return null;
      }

      // Prepare the profiling prompt
      const prompt = relationshipProfilingTemplate
        .replace('{{partner1ConversationHistory}}', partner1History)
        .replace('{{partner2ConversationHistory}}', partner2History);

      // Use model for comprehensive analysis
      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: prompt,
      });

      // Check if response is empty or invalid
      if (!response || typeof response !== 'string' || response.trim() === '') {
        logger.error('[Deepen-Connection] Empty or invalid response from model for profiling');
        return null;
      }

      // Parse the response to extract relationship information
      const profileData = this.parseProfilingResponse(response);

      if (profileData) {
        logger.info(
          `[Deepen-Connection] Successfully profiled relationship: ${profileData.relationshipStage || 'Unknown'}`
        );

        // Save profile data as memories for both users
        await this.saveProfileAsMemories(runtime, person1Id, person2Id, profileData);

        return profileData;
      } else {
        logger.error('[Deepen-Connection] Failed to parse profiling response');
        logger.debug(
          `[Deepen-Connection] Raw response (first 500 chars): ${response.substring(0, 500)}`
        );
        return null;
      }
    } catch (error: unknown) {
      logger.error(
        `[Deepen-Connection] Error profiling relationship: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Get conversation history for a partner
   */
  private async getConversationHistory(
    runtime: IAgentRuntime,
    entityId: UUID
  ): Promise<string | null> {
    try {
      // Get recent messages from the user's room (last 50 messages should be sufficient)
      const messages = await runtime.getMemories({
        tableName: 'messages',
        roomId: entityId, // Assuming DM room ID matches user ID
        count: 50,
        unique: false,
      });

      if (messages.length === 0) {
        return null;
      }

      // Format messages into readable conversation history
      const conversationHistory = messages
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)) // Sort by timestamp
        .map((message) => {
          const timestamp = new Date(message.createdAt || Date.now()).toLocaleString();
          const sender = message.entityId === runtime.agentId ? 'AI' : 'User';
          return `[${timestamp}] ${sender}: ${message.content.text || ''}`;
        })
        .join('\n');

      return conversationHistory;
    } catch (error: unknown) {
      logger.error(
        `[Deepen-Connection] Error getting conversation history for ${entityId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Parse the profiling response from the LLM
   */
  private parseProfilingResponse(response: string) {
    try {
      const profileData: any = {};

      // First check if response is wrapped in <response> tags
      let responseContent = response;
      const responseMatch = response.match(/<response>([\s\S]*?)<\/response>/);
      if (responseMatch) {
        responseContent = responseMatch[1];
      }

      // Extract relationshipStage
      const stageMatch = responseContent.match(/<relationshipStage>(.*?)<\/relationshipStage>/);
      if (stageMatch) {
        profileData.relationshipStage = stageMatch[1].trim();
      }

      // Extract relationshipLength
      const lengthMatch = responseContent.match(/<relationshipLength>(.*?)<\/relationshipLength>/);
      if (lengthMatch) {
        const length = parseInt(lengthMatch[1].trim());
        if (!isNaN(length)) {
          profileData.relationshipLength = length;
        }
      }

      // Extract currentDynamics
      const dynamicsMatch = responseContent.match(/<currentDynamics>(.*?)<\/currentDynamics>/);
      if (dynamicsMatch) {
        profileData.currentDynamics = dynamicsMatch[1].trim();
      }

      // Extract recentPatterns
      const patternsMatch = responseContent.match(/<recentPatterns>(.*?)<\/recentPatterns>/);
      if (patternsMatch) {
        profileData.recentPatterns = patternsMatch[1].trim();
      }

      // Extract activeChallenges
      const challengesMatch = responseContent.match(/<activeChallenges>(.*?)<\/activeChallenges>/);
      if (challengesMatch) {
        profileData.activeChallenges = challengesMatch[1].trim();
      }

      // Extract sharedGoals
      const goalsMatch = responseContent.match(/<sharedGoals>(.*?)<\/sharedGoals>/);
      if (goalsMatch) {
        profileData.sharedGoals = goalsMatch[1].trim();
      }

      // Extract culturalContext
      const culturalMatch = responseContent.match(/<culturalContext>(.*?)<\/culturalContext>/);
      if (culturalMatch) {
        profileData.culturalContext = culturalMatch[1].trim();
      }

      // Only return data if we extracted at least relationshipStage
      if (profileData.relationshipStage) {
        profileData.profiledAt = new Date().toISOString();
        return profileData;
      }

      return null;
    } catch (error: unknown) {
      logger.error(
        `[Deepen-Connection] Error parsing profiling response: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Save profile data as memories for both users
   */
  private async saveProfileAsMemories(
    runtime: IAgentRuntime,
    person1Id: UUID,
    person2Id: UUID,
    profileData: any
  ) {
    try {
      const memoryTypes = [
        { key: 'relationshipStage', type: 'shared_relationship_stage' },
        { key: 'relationshipLength', type: 'shared_relationship_length' },
        { key: 'currentDynamics', type: 'shared_relationship_dynamic' },
        { key: 'recentPatterns', type: 'shared_relationship_pattern' },
        { key: 'activeChallenges', type: 'shared_relationship_Patterns' },
        { key: 'sharedGoals', type: 'shared_relationship_goals' },
        { key: 'culturalContext', type: 'shared_relationship_cultural_context' },
      ];

      // Save memories for both users
      for (const { key, type } of memoryTypes) {
        if (profileData[key]) {
          // Save for person1
          await runtime.createMemory(
            {
              entityId: person1Id,
              content: {
                text: String(profileData[key]),
              } as Content,
              roomId: person1Id,
              metadata: {
                type: type,
                profiledAt: profileData.profiledAt,
                partnerId: person2Id,
              },
            },
            'memories'
          );

          // Save for person2
          await runtime.createMemory(
            {
              entityId: person2Id,
              content: {
                text: String(profileData[key]),
              } as Content,
              roomId: person2Id,
              metadata: {
                type: type,
                profiledAt: profileData.profiledAt,
                partnerId: person1Id,
              },
            },
            'memories'
          );

          logger.debug(`[Deepen-Connection] Saved ${type} memory for both users`);
        }
      }

      logger.info('[Deepen-Connection] Successfully saved profile data as memories for both users');
    } catch (error: unknown) {
      logger.error(
        `[Deepen-Connection] Error saving profile data as memories: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get shared relationship context from saved memories
   */
  private async getSharedRelationshipContext(
    runtime: IAgentRuntime,
    person1Id: UUID,
    _person2Id: UUID // Currently only using person1Id for memory lookup, could extend to check both
  ): Promise<string> {
    try {
      // Define which types should fetch multiple memories
      const singleValueTypes = ['shared_relationship_stage', 'shared_relationship_length'];
      const multiValueTypes = [
        'shared_relationship_dynamic',
        'shared_relationship_pattern',
        'shared_relationship_Patterns', // Active challenges (linter changed this)
        'shared_relationship_goals',
        'shared_relationship_cultural_context',
      ];

      const contextParts: string[] = [];

      // Fetch single value memories (stage and length)
      for (const type of singleValueTypes) {
        const memories = await runtime.getMemories({
          tableName: 'memories',
          entityId: person1Id,
          count: 10,
          unique: false,
        });

        // Filter memories by type on the client side
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
          entityId: person1Id,
          count: 20,
          unique: false,
        });

        // Filter memories by type on the client side first
        const filteredMemories = memories.filter(
          (m) => m.metadata && (m.metadata as any).type === type
        );

        if (filteredMemories.length > 0) {
          // Sort by creation time (most recent first) and extract values, limit to 3
          const values = filteredMemories
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .slice(0, 3)
            .map((m) => m.content.text)
            .filter((text) => text); // Filter out any empty values

          if (values.length > 0) {
            // Format the context based on type
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

      // If we have context, join it; otherwise provide a default
      if (contextParts.length > 0) {
        return contextParts.join('\n');
      } else {
        // Fallback to basic info if no profiling data exists yet
        logger.debug(
          '[Deepen-Connection] No relationship profile memories found, using basic context'
        );
        return 'No detailed relationship profile available yet. This is a new or recently established connection.';
      }
    } catch (error: unknown) {
      logger.error(
        `[Deepen-Connection] Error fetching shared relationship context: ${error instanceof Error ? error.message : String(error)}`
      );
      return 'Unable to fetch relationship context at this time.';
    }
  }

  /**
   * Stop the service
   */
  async stop() {
    await this.memgraphService.disconnect();
    logger.debug('[Deepen-Connection] DailyPlanningService stopped');
  }
}

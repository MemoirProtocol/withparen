import {
  type IAgentRuntime,
  type Memory,
  type Action,
  type State,
  type ActionExample,
  type HandlerCallback,
  type ActionResult,
  ModelType,
  parseKeyValueXml,
  logger,
} from '@elizaos/core';
import { MemgraphService } from '../services/memgraph.js';
import {
  connectionExtractionTemplate,
  connectionResponseTemplate,
} from '../utils/promptTemplates.js';

/**
 * Action to create a new HumanConnection with waitlist status
 */
export const createConnectionAction: Action = {
  name: 'CREATE_CONNECTION',
  description:
    'Creates a new human connection with waitlist status based on user-provided names and secret',
  similes: [
    'CREATE_HUMAN_CONNECTION',
    'SETUP_CONNECTION',
    'JOIN_WAITLIST',
    'REGISTER_CONNECTION',
    'ADD_CONNECTION',
  ],
  examples: [] as ActionExample[][],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const messageText = message.content?.text?.trim() || '';

    // Only exclude completely empty messages
    if (messageText.length === 0) {
      return false;
    }

    // Skip authentication check - allow connection creation without sign-in
    logger.debug(
      `[createConnection] Validation passed: Allowing connection creation without authentication for webId: ${message.entityId}`
    );
    return true;

    // TODO: Re-enable authentication check if needed in the future
    // const memgraphService = new MemgraphService();
    // try {
    //   await memgraphService.connect();
    //   const webId = message.entityId;
    //   const person = await memgraphService.findPersonByWebId(webId);
    //   if (!person || !person.email) {
    //     return false;
    //   }
    //   return true;
    // } catch (error) {
    //   logger.error(`[createConnection] Validation error: ${error}`);
    //   return false;
    // } finally {
    //   await memgraphService.disconnect();
    // }
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const memgraphService = new MemgraphService();

    try {
      await memgraphService.connect();

      // Get the user's entityId as connectionId
      const connectionId = message.entityId;

      // Get recent messages for context (limit to last 20)
      const recentMessages = await runtime.getMemories({
        tableName: 'messages',
        roomId: message.roomId,
        count: 20,
        unique: false,
      });

      // Sort chronologically (oldest -> newest) and format with role + time for clarity
      const formattedMessages = recentMessages
        .sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0))
        .map((msg: any) => {
          const text = (msg.content?.text || '').trim();
          if (!text) return '';
          const isAgent = msg.entityId === runtime.agentId;
          const sender = isAgent ? 'Seren' : 'User';
          const time = msg.createdAt ? new Date(msg.createdAt).toISOString() : '';
          return `${time} ${sender}: ${text}`.trim();
        })
        .filter((line: string) => line.length > 0)
        .join('\n');

      // Create extraction prompt
      const extractionPrompt = connectionExtractionTemplate.replace(
        '{{recentMessages}}',
        formattedMessages
      );

      // Use LLM to extract connection info
      const response = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: extractionPrompt,
        temperature: 0.1,
      });

      let extractedInfo;
      try {
        extractedInfo = parseKeyValueXml(response);
        if (!extractedInfo) {
          throw new Error('Failed to parse XML response');
        }
        logger.debug('[createConnection] Successfully extracted connection info:', extractedInfo);
      } catch (e) {
        logger.error(`[createConnection] Failed to create connection in database: ${e}`);

        // Generate error response using template
        const errorResponsePrompt = connectionResponseTemplate
          .replace('{{username}}', '')
          .replace('{{partnername}}', '')
          .replace('{{secret}}', '')
          .replace('{{missingInfo}}', 'all information')
          .replace('{{connectionExists}}', 'false')
          .replace('{{connectionCreated}}', 'false');

        const errorResponse = await runtime.useModel(ModelType.TEXT_SMALL, {
          prompt: errorResponsePrompt,
          temperature: 0.3,
        });

        const parsedErrorResponse = parseKeyValueXml(errorResponse);
        const responseText =
          parsedErrorResponse?.message ||
          "I had trouble understanding the connection information. Could you please provide your name, your partner's name, and your shared secret more clearly?";

        if (callback) {
          await callback({
            text: responseText,
            thought: parsedErrorResponse?.thought || 'Failed to parse connection information',
            actions: ['CREATE_CONNECTION'],
          });
        }

        return {
          text: responseText,
          success: false,
          error: e instanceof Error ? e : new Error(String(e)),
        };
      }

      // Check if connection already exists for this user
      let existingConnection = await memgraphService.findConnectionByConnectionId(connectionId);

      // Prepare updates object with only non-empty values
      const updates: any = {};
      if (extractedInfo.username && extractedInfo.username.trim()) {
        updates.username = extractedInfo.username.trim();
      }
      if (extractedInfo.partnername && extractedInfo.partnername.trim()) {
        updates.partnername = extractedInfo.partnername.trim();
      }
      if (extractedInfo.secret && extractedInfo.secret.trim()) {
        updates.secret = extractedInfo.secret.trim();
      }

      let connection;
      if (existingConnection) {
        // Update existing connection with new information
        connection = await memgraphService.updateHumanConnection(connectionId, updates);
        logger.info('[createConnection] Updated existing HumanConnection:', connection);
      } else {
        // Create new connection
        connection = await memgraphService.createHumanConnectionWithWaitlist(
          connectionId,
          updates.username,
          updates.partnername,
          updates.secret
        );
        logger.info('[createConnection] Created new HumanConnection:', connection);
      }

      // Ensure Person node exists and link to HumanConnection
      try {
        const webId = message.entityId;

        // Check if Person node exists, create if it doesn't
        let person = await memgraphService.findPersonByWebId(webId);
        if (!person) {
          // Create a basic Person node without email (no authentication required)
          person = await memgraphService.createPerson(webId);
          logger.debug(`[createConnection] Created basic Person node for webId: ${webId}`);
        }

        // If we extracted a username, persist it on the Person node
        if (updates.username && updates.username.trim().length > 0) {
          await memgraphService.updatePersonName(webId, updates.username);
          logger.debug(`[createConnection] Updated Person name for webId: ${webId}`);
        }

        // Create/ensure PARTICIPATES_IN relation Person -> HumanConnection
        await memgraphService.linkPersonToConnection(webId, connectionId, 'partner');
        logger.debug('[createConnection] Linked Person to HumanConnection via PARTICIPATES_IN');
      } catch (linkError) {
        logger.warn(
          `[createConnection] Failed to link Person to HumanConnection or update name: ${linkError}`
        );
      }

      // Check if we have all required information
      const partners = connection?.partners || [];
      const hasUsername = partners.length > 0 && partners[0]?.trim();
      const hasPartnername = partners.length > 1 && partners[1]?.trim();
      const hasSecret = connection?.secret && connection.secret.trim();
      const allComplete = hasUsername && hasPartnername && hasSecret;

      // Check if a complete connection with same details already exists (different from current user)
      let duplicateConnection: any = null;
      if (allComplete) {
        const foundConnection = await memgraphService.findExistingHumanConnection(
          partners[0],
          partners[1],
          connection.secret!
        );
        // Make sure it's not the same connection we just created/updated
        if (foundConnection && foundConnection.connectionId !== connectionId) {
          duplicateConnection = foundConnection;
        }
      }

      // Determine missing information
      const missingItems: string[] = [];
      if (!hasUsername) missingItems.push('your name');
      if (!hasPartnername) missingItems.push("your partner's name");
      if (!hasSecret) missingItems.push('your secret word or phrase');

      // Generate response using template
      const responsePrompt = connectionResponseTemplate
        .replace('{{username}}', partners[0] || '')
        .replace('{{partnername}}', partners[1] || '')
        .replace('{{secret}}', connection?.secret || '')
        .replace('{{missingInfo}}', missingItems.join(', '))
        .replace('{{connectionExists}}', duplicateConnection ? 'true' : 'false')
        .replace('{{connectionCreated}}', allComplete && !duplicateConnection ? 'true' : 'false');

      const generatedResponse = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: responsePrompt,
        temperature: 0.3,
      });

      const parsedResponse = parseKeyValueXml(generatedResponse);
      const responseText = parsedResponse?.message || "I'm processing your connection information.";

      if (callback) {
        await callback({
          text: responseText,
          thought: parsedResponse?.thought || 'Processing connection information',
          actions: ['CREATE_CONNECTION'],
        });
      }

      return {
        text: responseText,
        success: true,
        values: {
          connectionExists: !!duplicateConnection,
          connectionCreated: allComplete && !duplicateConnection,
          username: partners[0] || '',
          partnername: partners[1] || '',
          hasSecret: !!hasSecret,
          status: connection?.status,
          missingInfo: missingItems,
          allComplete,
        },
        data: {
          connection,
          duplicateConnection,
        },
      };
    } catch (error) {
      logger.error(`[createConnection] Error creating connection: ${error}`);

      // Generate error response using template
      const errorResponsePrompt = connectionResponseTemplate
        .replace('{{username}}', '')
        .replace('{{partnername}}', '')
        .replace('{{secret}}', '')
        .replace('{{missingInfo}}', 'system error occurred')
        .replace('{{connectionExists}}', 'false')
        .replace('{{connectionCreated}}', 'false');

      try {
        const errorResponse = await runtime.useModel(ModelType.TEXT_SMALL, {
          prompt: errorResponsePrompt,
          temperature: 0.3,
        });

        const parsedErrorResponse = parseKeyValueXml(errorResponse);
        const responseText =
          parsedErrorResponse?.message ||
          'I encountered an issue while creating your connection. Please try again or contact support if the problem persists.';

        if (callback) {
          await callback({
            text: responseText,
            thought: parsedErrorResponse?.thought || 'System error occurred',
            actions: ['CREATE_CONNECTION'],
          });
        }

        return {
          text: responseText,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      } catch (responseError) {
        const fallbackText =
          'I encountered an issue while creating your connection. Please try again or contact support if the problem persists.';

        if (callback) {
          await callback({
            text: fallbackText,
            thought: 'System error occurred',
            actions: ['CREATE_CONNECTION'],
          });
        }

        return {
          text: fallbackText,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    } finally {
      await memgraphService.disconnect();
    }
  },
};

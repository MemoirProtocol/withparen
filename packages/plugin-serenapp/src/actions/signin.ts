import {
  type IAgentRuntime,
  type Memory,
  type Action,
  type State,
  type ActionExample,
  type HandlerCallback,
  type ActionResult,
  logger,
} from '@elizaos/core';
import { MemgraphService } from '../services/memgraph.js';

/**
 * Action to handle user signin and create Person node in memgraph
 */
export const signinAction: Action = {
  name: 'SIGNIN',
  description:
    'call this action when you recieve the authentication data from firebase including user email address. ',
  similes: ['SIGN_IN', 'LOGIN', 'AUTHENTICATE', 'USER_AUTH', 'FIREBASE_AUTH'],
  examples: [] as ActionExample[][],
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const messageText = message.content?.text?.trim() || '';

    // Check if the message contains Firebase authentication data
    return (
      messageText.includes('Firebase identity data') &&
      (messageText.includes('successfully authenticated') ||
        messageText.includes('authenticated their email'))
    );
  },
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    _callback?: HandlerCallback
  ): Promise<ActionResult> => {
    const memgraphService = new MemgraphService();

    try {
      logger.debug(`[signin] Starting signin process for webId: ${message.entityId}`);
      await memgraphService.connect();
      logger.debug('[signin] Connected to Memgraph successfully');

      const messageText = message.content?.text || '';
      const webId = message.entityId;

      // Extract Firebase identity data from the message
      let email: string | undefined;
      let firebaseId: string | undefined;
      let firebaseToken: string | undefined;
      let authorId: string | undefined;

      try {
        // Extract email
        const emailMatch = messageText.match(/"email":\s*"([^"]+)"/);
        if (emailMatch) {
          email = emailMatch[1];
        }

        // Extract Firebase ID
        const idMatch = messageText.match(/"id":\s*"([^"]+)"/);
        if (idMatch) {
          firebaseId = idMatch[1];
        }

        // Extract Firebase token
        const tokenMatch = messageText.match(/"token":\s*"([^"]+)"/);
        if (tokenMatch) {
          firebaseToken = tokenMatch[1];
        }

        // Extract authorId from Firebase payload
        const authorIdMatch = messageText.match(/"authorId":\s*"([^"]+)"/);
        if (authorIdMatch) {
          authorId = authorIdMatch[1];
        }

        logger.debug(
          `[signin] Extracted Firebase data: ${JSON.stringify({
            webId,
            email,
            firebaseId: firebaseId || undefined,
            authorId: authorId || undefined,
            hasToken: !!firebaseToken,
          })}`
        );
      } catch (error) {
        logger.error(`[signin] Error extracting Firebase data: ${error}`);
        throw new Error('Failed to extract authentication data from message');
      }

      // Upsert logic: prefer locating by firebaseId if provided, else by webId
      let person;
      let wasCreated = false;
      let wasUpdated = false;

      if (firebaseId) {
        logger.debug(`[signin] Checking for existing Person by firebaseId: ${firebaseId}`);
        const existingByFirebase = await memgraphService.findPersonByFirebaseId(firebaseId);
        if (existingByFirebase) {
          logger.info('[signin] Found existing Person by firebaseId, applying updates');
          person = await memgraphService.updatePersonAuthByFirebaseId(firebaseId, {
            email,
            firebaseToken,
            authorId,
          });
          wasUpdated = true;
        }
      }

      if (!person) {
        logger.debug(`[signin] Checking if person exists in database for webId: ${webId}`);
        const existingByWebId = await memgraphService.findPersonByWebId(webId);
        logger.debug(`[signin] Existing person by webId: ${!!existingByWebId}`);
        if (existingByWebId) {
          logger.info('[signin] Updating existing Person by webId');
          person = await memgraphService.updatePersonAuthByWebId(webId, {
            email,
            firebaseId,
            firebaseToken,
            authorId,
          });
          wasUpdated = true;
        }
      }

      if (!person) {
        // Create new Person node
        person = await memgraphService.createPerson(
          webId,
          email,
          firebaseId,
          firebaseToken,
          authorId
        );
        wasCreated = true;
        logger.info(
          `[signin] Created new Person node: webId=${person.webId}, email=${person.email}, hasFirebaseId=${!!person.firebaseId}, hasToken=${!!person.firebaseToken}`
        );
      }

      logger.debug(
        `[signin] Final signin result: ${JSON.stringify({
          webId,
          email,
          hasFirebaseId: !!firebaseId,
          hasToken: !!firebaseToken,
        })}`
      );

      // Return success without generating a response - let normal message handler continue
      return {
        text: '', // No text response needed
        success: true,
        values: {
          webId,
          email,
          firebaseId,
          hasToken: !!firebaseToken,
          personCreated: wasCreated,
          personAlreadyExisted: !wasCreated,
          personUpdated: wasUpdated,
        },
        data: {
          person,
        },
      };
    } catch (error) {
      logger.error(`[signin] Error processing signin: ${error}`);

      return {
        text: '', // No text response needed
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    } finally {
      await memgraphService.disconnect();
    }
  },
};

import { type IAgentRuntime, logger } from '@elizaos/core';

/**
 * Utility functions for user information retrieval
 */

/**
 * Helper function to get username from entity or message memories
 * This function first checks entity metadata, then falls back to message memories
 * to find the username stored in entityUserName field
 */
export async function getUsernameFromMemories(
  runtime: IAgentRuntime,
  userId: string
): Promise<string | undefined> {
  try {
    // First try to get from entity metadata
    const entity = await runtime.getEntityById(userId);
    if (entity?.metadata?.username) {
      return entity.metadata.username as string;
    }

    // If not found in entity, look in message memories
    const messages = await runtime.getMemories({
      tableName: 'messages',
      entityId: userId,
      count: 10,
    });

    // Look for username in message metadata
    for (const message of messages) {
      const metadata = message.metadata as any;
      if (metadata?.entityUserName) {
        return metadata.entityUserName;
      }
    }

    return undefined;
  } catch (error) {
    logger.error(`[discover-connection] Error getting username for user ${userId}: ${error}`);
    return undefined;
  }
}

/**
 * Helper function to get entityName from entity or message memories
 * This function first checks entity metadata, then falls back to message memories
 * to find the display name stored in entityName field
 */
async function getEntityNameFromMemories(
  runtime: IAgentRuntime,
  userId: string
): Promise<string | undefined> {
  try {
    // First try to get from entity metadata
    const entity = await runtime.getEntityById(userId);
    if (entity?.metadata?.name) {
      return entity.metadata.name as string;
    }

    // If not found in entity, look in message memories
    const messages = await runtime.getMemories({
      tableName: 'messages',
      entityId: userId,
      count: 10,
    });

    // Look for entityName in message metadata
    for (const message of messages) {
      const metadata = message.metadata as any;
      if (metadata?.entityName) {
        return metadata.entityName;
      }
    }

    return undefined;
  } catch (error) {
    logger.error(`[discover-connection] Error getting entityName for user ${userId}: ${error}`);
    return undefined;
  }
}

/**
 * Helper function to update entity metadata with username from message memories
 * This ensures that usernames are stored in entity metadata for future use
 */
export async function updateEntityWithUsername(
  runtime: IAgentRuntime,
  userId: string
): Promise<void> {
  try {
    const entity = await runtime.getEntityById(userId);
    if (!entity) {
      logger.warn(`[discover-connection] Entity not found for user ${userId}`);
      return;
    }

    // If entity already has username, no need to update
    if (entity.metadata?.username) {
      return;
    }

    // Get username from message memories
    const username = await getUsernameFromMemories(runtime, userId);
    if (username) {
      // Update entity metadata with username
      const updatedEntity = {
        ...entity,
        metadata: {
          ...entity.metadata,
          username: username,
        },
      };

      await runtime.updateEntity(updatedEntity);
      logger.info(`[discover-connection] Updated entity ${userId} with username: ${username}`);
    }
  } catch (error) {
    logger.error(
      `[discover-connection] Error updating entity with username for ${userId}: ${error}`
    );
  }
}

/**
 * Helper function to get user display name and username
 * Returns both display name and username for a user
 * Also attempts to update entity metadata if username is missing
 */
export async function getUserInfo(
  runtime: IAgentRuntime,
  userId: string
): Promise<{
  displayName: string;
  username?: string;
}> {
  try {
    const entity = await runtime.getEntityById(userId);

    // Try to get entityName from entity or messages
    let entityName = entity?.metadata?.name as string | undefined;
    if (!entityName) {
      entityName = await getEntityNameFromMemories(runtime, userId);
    }

    const displayName =
      entityName || // Use Telegram's entityName first
      entity?.metadata?.username ||
      'your connection'; // Better fallback than showing UUID

    let username = entity?.metadata?.username as string | undefined;

    // If no username in entity metadata, try to get from memories and update entity
    if (!username) {
      username = await getUsernameFromMemories(runtime, userId);
      if (username) {
        // Update entity metadata in background (don't await to avoid blocking)
        updateEntityWithUsername(runtime, userId).catch((error) => {
          logger.error(
            `[discover-connection] Background entity update failed for ${userId}: ${error}`
          );
        });
      }
    }

    return {
      displayName,
      username,
    };
  } catch (error) {
    logger.error(`[discover-connection] Error getting user info for ${userId}: ${error}`);
    return {
      displayName: `User${userId}`,
      username: undefined,
    };
  }
}

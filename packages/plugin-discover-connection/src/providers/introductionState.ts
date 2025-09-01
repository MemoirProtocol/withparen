import { type IAgentRuntime, type Memory, type Provider, type State, logger } from '@elizaos/core';

/**
 * Introduction State Provider for Discover-Connection
 * Provides detailed information about introduction workflow and messages
 */
export const introductionStateProvider: Provider = {
  name: 'INTRODUCTION_STATE',

  description: 'Provides detailed introduction workflow information and messages for the user',

  get: async (runtime: IAgentRuntime, message: Memory, _state?: State) => {
    try {
      const userId = message.entityId;

      // Get all introduction records for this user
      const introductions = await runtime.getMemories({
        tableName: 'introductions',
        count: 100,
      });

      // Filter introductions involving this user (both sent and received)
      const userIntroductions = introductions.filter((intro) => {
        const introData = intro.content as any;
        return introData.fromUserId === userId || introData.toUserId === userId;
      });

      if (userIntroductions.length === 0) {
        return {
          text: 'No introduction requests yet.',
          data: { introductionCount: 0 },
          values: { introSummary: 'No introduction requests yet.' },
        };
      }

      // Separate sent and received introductions
      const sentIntroductions = userIntroductions.filter((intro) => {
        const introData = intro.content as any;
        return introData.fromUserId === userId;
      });

      const receivedIntroductions = userIntroductions.filter((intro) => {
        const introData = intro.content as any;
        return introData.toUserId === userId;
      });

      let introSummary = `Introduction Status for user ${userId}:\n\n`;

      // Sent introductions
      if (sentIntroductions.length > 0) {
        introSummary += `Introduction Requests You Sent: ${sentIntroductions.length}\n`;

        sentIntroductions.forEach((intro, index) => {
          const introData = intro.content as any;
          const status = introData.status;
          const createdAt = new Date(intro.createdAt || 0).toLocaleDateString();

          introSummary += `  ${index + 1}. To ${introData.toUserId} - Status: ${status} (${createdAt})\n`;

          if (status === 'proposal_sent') {
            introSummary += `     Waiting for their response...\n`;
          } else if (status === 'accepted') {
            introSummary += `     Great! They accepted the connection.\n`;
          } else if (status === 'declined') {
            introSummary += `     They declined this connection.\n`;
          }
        });
        introSummary += '\n';
      }

      // Received introductions
      if (receivedIntroductions.length > 0) {
        introSummary += `Introduction Requests You Received: ${receivedIntroductions.length}\n`;

        receivedIntroductions.forEach((intro, index) => {
          const introData = intro.content as any;
          const status = introData.status;
          const createdAt = new Date(intro.createdAt || 0).toLocaleDateString();

          introSummary += `  ${index + 1}. From ${introData.fromUserId} - Status: ${status} (${createdAt})\n`;

          if (status === 'proposal_sent') {
            introSummary += `     Awaiting your response: "${introData.introductionMessage?.substring(0, 100)}..."\n`;
          } else if (status === 'accepted') {
            introSummary += `     You accepted this connection.\n`;
          } else if (status === 'declined') {
            introSummary += `     You declined this connection.\n`;
          }
        });
        introSummary += '\n';
      }

      // Add current pending actions
      const pendingReceivedIntros = receivedIntroductions.filter((intro) => {
        const introData = intro.content as any;
        return introData.status === 'proposal_sent';
      });

      const pendingSentIntros = sentIntroductions.filter((intro) => {
        const introData = intro.content as any;
        return introData.status === 'proposal_sent';
      });

      if (pendingReceivedIntros.length > 0) {
        introSummary += `⏳ You have ${pendingReceivedIntros.length} pending introduction request(s) waiting for your response.\n`;
        introSummary += 'Say "yes" or "accept" to connect, or "no" or "decline" to pass.\n\n';
      }

      if (pendingSentIntros.length > 0) {
        introSummary += `📤 You have ${pendingSentIntros.length} introduction request(s) waiting for responses from potential matches.\n\n`;
      }

      // Success summary
      const successfulConnections = userIntroductions.filter((intro) => {
        const introData = intro.content as any;
        return introData.status === 'accepted';
      });

      if (successfulConnections.length > 0) {
        introSummary += `🎉 Total successful connections made: ${successfulConnections.length}\n`;
      }

      return {
        text: introSummary,
        data: {
          totalIntroductions: userIntroductions.length,
          sentCount: sentIntroductions.length,
          receivedCount: receivedIntroductions.length,
          pendingReceived: pendingReceivedIntros.length,
          pendingSent: pendingSentIntros.length,
          successfulConnections: successfulConnections.length,
        },
        values: {
          introSummary,
          hasPendingReceived: pendingReceivedIntros.length > 0,
          hasPendingSent: pendingSentIntros.length > 0,
          successCount: successfulConnections.length,
        },
      };
    } catch (error) {
      logger.error(`[discover-connection] Error in introduction state provider: ${error}`);
      return {
        text: 'Unable to retrieve introduction status information at this time.',
        data: { error: true },
        values: { introSummary: 'Error retrieving introduction status' },
      };
    }
  },
};

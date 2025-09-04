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

      // Also check matches table for introduction statuses
      const matches = await runtime.getMemories({
        tableName: 'matches',
        count: 50,
      });

      const introductionMatches = matches.filter((match) => {
        const matchData = match.content as any;
        return (
          (matchData.user1Id === userId || matchData.user2Id === userId) &&
          (matchData.status === 'introduction_outgoing' || matchData.status === 'introduction_incoming')
        );
      });

      // Convert match records to introduction format for consistency
      const matchBasedIntroductions = introductionMatches.map((match) => {
        const matchData = match.content as any;
        const isOutgoing = matchData.user1Id === userId;
        return {
          id: match.id,
          content: {
            fromUserId: isOutgoing ? userId : (matchData.user1Id === userId ? matchData.user2Id : matchData.user1Id),
            toUserId: isOutgoing ? (matchData.user1Id === userId ? matchData.user2Id : matchData.user1Id) : userId,
            status: 'proposal_sent', // Default status for active match introductions
            introductionMessage: `Introduction based on match compatibility score: ${matchData.compatibilityScore}`,
          },
          createdAt: match.createdAt,
        };
      });

      // Combine both sources
      const allIntroductions = [...userIntroductions, ...matchBasedIntroductions];

      if (allIntroductions.length === 0) {
        return {
          text: '# Introduction Status\n\n## Current Status: No Introduction Requests\nYou have no introduction requests yet. Once you find matches and request introductions, they will appear here.\n\n## Next Steps\n- Complete your onboarding to find potential connections\n- Use the "Find Match" action to discover compatible people',
          data: { introductionCount: 0 },
          values: { introSummary: 'No introduction requests yet.' },
        };
      }

      // Separate sent and received introductions
      const sentIntroductions = allIntroductions.filter((intro) => {
        const introData = intro.content as any;
        return introData.fromUserId === userId;
      });

      const receivedIntroductions = allIntroductions.filter((intro) => {
        const introData = intro.content as any;
        return introData.toUserId === userId;
      });

      let introSummary = `# Introduction Status Information\n\n## Overview for User ${userId}\n\n`;

      // Sent introductions
      if (sentIntroductions.length > 0) {
        introSummary += `## Introduction Requests You Sent: ${sentIntroductions.length}\n`;
        introSummary += `Status Meaning: These are connections you've requested through introduction proposals.\n\n`;

        sentIntroductions.forEach((intro, index) => {
          const introData = intro.content as any;
          const status = introData.status;
          const createdAt = new Date(intro.createdAt || 0).toLocaleDateString();

          introSummary += `### ${index + 1}. To ${introData.toUserId}\n`;
          introSummary += `- **Status**: ${status}\n`;
          introSummary += `- **Date**: ${createdAt}\n`;

          if (status === 'proposal_sent') {
            introSummary += `- **Action Needed**: Waiting for their response\n`;
          } else if (status === 'accepted') {
            introSummary += `- **Result**: ✅ They accepted the connection! You can now communicate directly.\n`;
          } else if (status === 'declined') {
            introSummary += `- **Result**: ❌ They declined this connection.\n`;
          }
          introSummary += '\n';
        });
      }

      // Received introductions
      if (receivedIntroductions.length > 0) {
        introSummary += `## Introduction Requests You Received: ${receivedIntroductions.length}\n`;
        introSummary += `Status Meaning: These are people who want to connect with you.\n\n`;

        receivedIntroductions.forEach((intro, index) => {
          const introData = intro.content as any;
          const status = introData.status;
          const createdAt = new Date(intro.createdAt || 0).toLocaleDateString();

          introSummary += `### ${index + 1}. From ${introData.fromUserId}\n`;
          introSummary += `- **Status**: ${status}\n`;
          introSummary += `- **Date**: ${createdAt}\n`;

          if (status === 'proposal_sent') {
            introSummary += `- **Message**: "${introData.introductionMessage?.substring(0, 100)}..."\n`;
            introSummary += `- **Action Needed**: You need to respond - say "Yes, I accept" or "No, not interested"\n`;
          } else if (status === 'accepted') {
            introSummary += `- **Result**: ✅ You accepted this connection! You can now communicate directly.\n`;
          } else if (status === 'declined') {
            introSummary += `- **Result**: ❌ You declined this connection.\n`;
          }
          introSummary += '\n';
        });
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

      // Add action items section
      introSummary += `## Action Items\n`;
      
      if (pendingReceivedIntros.length > 0) {
        introSummary += `### ⏳ Pending Responses Needed: ${pendingReceivedIntros.length}\n`;
        introSummary += `You have ${pendingReceivedIntros.length} introduction request(s) waiting for your response.\n`;
        introSummary += `**What to say**: "yes" or "accept" to connect, or "no" or "decline" to pass.\n\n`;
      }

      if (pendingSentIntros.length > 0) {
        introSummary += `### 📤 Waiting for Responses: ${pendingSentIntros.length}\n`;
        introSummary += `You have ${pendingSentIntros.length} introduction request(s) sent out, waiting for responses from potential matches.\n\n`;
      }

      if (pendingReceivedIntros.length === 0 && pendingSentIntros.length === 0) {
        introSummary += `- No pending actions at this time\n`;
        introSummary += `- Consider using "Find Match" to discover new potential connections\n\n`;
      }

      // Success summary
      const successfulConnections = allIntroductions.filter((intro) => {
        const introData = intro.content as any;
        return introData.status === 'accepted';
      });

      if (successfulConnections.length > 0) {
        introSummary += `## Success Summary\n`;
        introSummary += `🎉 **Total successful connections made**: ${successfulConnections.length}\n`;
        introSummary += `These are people you can now communicate with directly.\n`;
      }

      return {
        text: introSummary,
        data: {
          totalIntroductions: allIntroductions.length,
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
        text: '# Introduction Status\n\n## Status: Error\nUnable to retrieve introduction status information at this time. Please try again later.\n\n## What You Can Do\n- Check your connection\n- Try refreshing or sending another message',
        data: { error: true },
        values: { introSummary: 'Error retrieving introduction status' },
      };
    }
  },
};

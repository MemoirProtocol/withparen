import { type IAgentRuntime, type Memory, type Provider, type State, logger } from '@elizaos/core';

/**
 * Match State Provider for Discover-Connection
 * Provides information about current match statuses and pending introductions
 */
export const matchStateProvider: Provider = {
  name: 'MATCH_STATE',

  description: 'Provides current match status and introduction workflow information for the user',

  get: async (runtime: IAgentRuntime, message: Memory, _state?: State) => {
    try {
      const userId = message.entityId;

      // Get all matches for this user
      const matches = await runtime.getMemories({
        tableName: 'matches',
        count: 100,
      });

      // Filter matches involving this user
      const userMatches = matches.filter((match) => {
        const matchData = match.content as any;
        return matchData.user1Id === userId || matchData.user2Id === userId;
      });

      if (userMatches.length === 0) {
        return {
          text: 'No matches found yet.',
          data: { matchCount: 0 },
          values: { statusSummary: 'No matches found yet.' },
        };
      }

      // Categorize matches by status
      const matchStatusCategories = {
        match_found: [] as any[],
        introduction_outgoing: [] as any[],
        introduction_incoming: [] as any[],
        connected: [] as any[],
        declined: [] as any[],
      };

      userMatches.forEach((match) => {
        const matchData = match.content as any;
        const status = matchData.status;
        if (matchStatusCategories[status as keyof typeof matchStatusCategories]) {
          matchStatusCategories[status as keyof typeof matchStatusCategories].push({
            matchId: match.id,
            otherUserId: matchData.user1Id === userId ? matchData.user2Id : matchData.user1Id,
            compatibilityScore: matchData.compatibilityScore,
            createdAt: match.createdAt,
            reasoning: matchData.reasoning,
          });
        }
      });

      // Build status summary
      let statusSummary = `Match Status Summary for user ${userId}:\n\n`;

      if (matchStatusCategories.match_found.length > 0) {
        statusSummary += `Pending Matches (awaiting your decision): ${matchStatusCategories.match_found.length}\n`;
        matchStatusCategories.match_found.forEach((match, index) => {
          statusSummary += `  ${index + 1}. Match with ${match.otherUserId} (Score: ${match.compatibilityScore})\n`;
        });
        statusSummary += '\n';
      }

      if (matchStatusCategories.introduction_outgoing.length > 0) {
        statusSummary += `Introduction Requests Sent (awaiting response): ${matchStatusCategories.introduction_outgoing.length}\n`;
        matchStatusCategories.introduction_outgoing.forEach((match, index) => {
          statusSummary += `  ${index + 1}. Sent to ${match.otherUserId} (Score: ${match.compatibilityScore})\n`;
        });
        statusSummary += '\n';
      }

      if (matchStatusCategories.introduction_incoming.length > 0) {
        statusSummary += `Introduction Requests Received (awaiting your response): ${matchStatusCategories.introduction_incoming.length}\n`;
        matchStatusCategories.introduction_incoming.forEach((match, index) => {
          statusSummary += `  ${index + 1}. From ${match.otherUserId} (Score: ${match.compatibilityScore})\n`;
        });
        statusSummary += '\n';
      }

      if (matchStatusCategories.connected.length > 0) {
        statusSummary += `Successful Connections: ${matchStatusCategories.connected.length}\n`;
        matchStatusCategories.connected.forEach((match, index) => {
          statusSummary += `  ${index + 1}. Connected with ${match.otherUserId} (Score: ${match.compatibilityScore})\n`;
        });
        statusSummary += '\n';
      }

      if (matchStatusCategories.declined.length > 0) {
        statusSummary += `Declined Introductions: ${matchStatusCategories.declined.length}\n`;
      }

      // Add context for next actions
      if (matchStatusCategories.match_found.length > 0) {
        statusSummary +=
          '\nNext Action: You can request introductions for your pending matches by saying "I would like an introduction" or "Yes, connect us".';
      }

      if (matchStatusCategories.introduction_incoming.length > 0) {
        statusSummary +=
          '\nNext Action: You can respond to introduction requests by saying "Yes, I accept" or "No, not interested".';
      }

      return {
        text: statusSummary,
        data: {
          matchCount: userMatches.length,
          categories: matchStatusCategories,
        },
        values: {
          statusSummary,
          pendingMatches: matchStatusCategories.match_found.length,
          outgoingIntros: matchStatusCategories.introduction_outgoing.length,
          incomingIntros: matchStatusCategories.introduction_incoming.length,
          connections: matchStatusCategories.connected.length,
        },
      };
    } catch (error) {
      logger.error(`[discover-connection] Error in match state provider: ${error}`);
      return {
        text: 'Unable to retrieve match status information at this time.',
        data: { error: true },
        values: { statusSummary: 'Error retrieving match status' },
      };
    }
  },
};

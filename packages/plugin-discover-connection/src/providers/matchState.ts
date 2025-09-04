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
          text: '# Match Status Information\n\n## Current Primary Status: no_matches\nYou have no matches yet. Consider sharing more about your interests, goals, and what kind of connections you\'re looking for.\n\n## Recommended Actions\n- **Find New Matches**: Share more about your background, interests, and goals to help find potential connections.',
          data: { matchCount: 0 },
          values: { statusSummary: 'No matches found yet.' },
        };
      }

      // Categorize matches by status
      const matchStatusCategories = {
        match_found: [] as any[],
        circles_verification_filled: [] as any[], // Ready for introduction proposals
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

      // Build status summary with proper formatting
      let statusSummary = `# Match Status Information\n\n`;

      // Determine primary status and add explanation
      let primaryStatus = 'none';
      let statusExplanation = '';

      if (matchStatusCategories.circles_verification_filled.length > 0) {
        primaryStatus = 'circles_verification_filled';
        statusExplanation = 'The user\'s Circles verification is complete and they have matches ready for introduction proposals.';
      } else if (matchStatusCategories.match_found.length > 0) {
        primaryStatus = 'matches_pending';
        statusExplanation = 'The user has potential matches waiting for their decision to request introductions.';
      } else if (matchStatusCategories.introduction_outgoing.length > 0) {
        primaryStatus = 'proposals_sent';
        statusExplanation = 'The user has introduction proposals sent out, waiting for responses from potential matches.';
      } else if (matchStatusCategories.introduction_incoming.length > 0) {
        primaryStatus = 'proposals_received';
        statusExplanation = 'The user has received introduction proposals that need their response.';
      } else if (matchStatusCategories.connected.length > 0) {
        primaryStatus = 'connections_made';
        statusExplanation = 'The user has successful connections established.';
      }

      statusSummary += `## Current Primary Status: ${primaryStatus}\n${statusExplanation}\n\n`;

      // Detailed breakdown
      if (matchStatusCategories.circles_verification_filled.length > 0) {
        statusSummary += `## Verification Complete - Ready for Proposals: ${matchStatusCategories.circles_verification_filled.length}\n`;
        statusSummary += `Status Meaning: The user's Circles verification is done and these matches can receive introduction proposals.\n`;
        matchStatusCategories.circles_verification_filled.forEach((match, index) => {
          statusSummary += `  ${index + 1}. Match with ${match.otherUserId} (Score: ${match.compatibilityScore})\n`;
        });
        statusSummary += '\n';
      }

      if (matchStatusCategories.match_found.length > 0) {
        statusSummary += `## Pending Matches - Awaiting User's Decision: ${matchStatusCategories.match_found.length}\n`;
        statusSummary += `Status Meaning: These are potential matches found for the user, waiting for their approval to send introduction proposals.\n`;
        matchStatusCategories.match_found.forEach((match, index) => {
          statusSummary += `  ${index + 1}. Match with ${match.otherUserId} (Score: ${match.compatibilityScore})\n`;
        });
        statusSummary += '\n';
      }

      if (matchStatusCategories.introduction_outgoing.length > 0) {
        statusSummary += `## Introduction Proposals Sent - Awaiting Response: ${matchStatusCategories.introduction_outgoing.length}\n`;
        statusSummary += `Status Meaning: The user has requested introductions to these people, waiting for them to accept or decline.\n`;
        matchStatusCategories.introduction_outgoing.forEach((match, index) => {
          statusSummary += `  ${index + 1}. Sent to ${match.otherUserId} (Score: ${match.compatibilityScore})\n`;
        });
        statusSummary += '\n';
      }

      if (matchStatusCategories.introduction_incoming.length > 0) {
        statusSummary += `## Introduction Proposals Received - Awaiting User's Response: ${matchStatusCategories.introduction_incoming.length}\n`;
        statusSummary += `Status Meaning: These people want to connect with the user, waiting for the user's acceptance or decline.\n`;
        matchStatusCategories.introduction_incoming.forEach((match, index) => {
          statusSummary += `  ${index + 1}. From ${match.otherUserId} (Score: ${match.compatibilityScore})\n`;
        });
        statusSummary += '\n';
      }

      if (matchStatusCategories.connected.length > 0) {
        statusSummary += `## Successful Connections: ${matchStatusCategories.connected.length}\n`;
        statusSummary += `Status Meaning: These are established connections where both parties have accepted the introduction.\n`;
        matchStatusCategories.connected.forEach((match, index) => {
          statusSummary += `  ${index + 1}. Connected with ${match.otherUserId} (Score: ${match.compatibilityScore})\n`;
        });
        statusSummary += '\n';
      }

      if (matchStatusCategories.declined.length > 0) {
        statusSummary += `## Declined Introductions: ${matchStatusCategories.declined.length}\n`;
        statusSummary += `Status Meaning: These introduction attempts were declined by either the user or the other party.\n`;
      }

      // Add recommended actions section
      statusSummary += `## Recommended Actions\n`;
      
      if (matchStatusCategories.circles_verification_filled.length > 0) {
        statusSummary += `- **Send Introduction Proposal**: Your matches are verified and ready. Say "introduce me" or "send the introduction".\n`;
      }
      
      if (matchStatusCategories.match_found.length > 0) {
        statusSummary += `- **Request Introduction**: Say "I would like an introduction" or "Yes, connect us" to proceed with your matches.\n`;
      }

      if (matchStatusCategories.introduction_incoming.length > 0) {
        statusSummary += `- **Respond to Proposals**: Say "Yes, I accept" or "No, not interested" to respond to introduction requests.\n`;
      }

      if (matchStatusCategories.circles_verification_filled.length === 0 && 
          matchStatusCategories.match_found.length === 0 && 
          matchStatusCategories.introduction_outgoing.length === 0 && 
          matchStatusCategories.introduction_incoming.length === 0) {
        statusSummary += `- **Find New Matches**: You can search for new connections by providing more details about your interests and goals.\n`;
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
          verificationCompleteMatches: matchStatusCategories.circles_verification_filled.length,
          outgoingIntros: matchStatusCategories.introduction_outgoing.length,
          incomingIntros: matchStatusCategories.introduction_incoming.length,
          connections: matchStatusCategories.connected.length,
        },
      };
    } catch (error) {
      logger.error(`[discover-connection] Error in match state provider: ${error}`);
      return {
        text: '# Match Status Information\n\n## Status: Error\nUnable to retrieve match status information at this time. Please try again later.',
        data: { error: true },
        values: { statusSummary: 'Error retrieving match status' },
      };
    }
  },
};

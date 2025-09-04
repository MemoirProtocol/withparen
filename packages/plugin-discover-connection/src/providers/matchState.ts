import { type IAgentRuntime, type Memory, type Provider, type State, logger } from '@elizaos/core';

/**
 * Match State Provider for Discover-Connection
 * Provides comprehensive information about match statuses and introduction workflow
 * Combines match state and introduction state functionality
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

      // Get introduction records for comprehensive status
      const introductions = await runtime.getMemories({
        tableName: 'introductions',
        count: 100,
      });

      // Filter introductions involving this user (both sent and received)
      const userIntroductions = introductions.filter((intro) => {
        const introData = intro.content as any;
        return introData.fromUserId === userId || introData.toUserId === userId;
      });

      if (userMatches.length === 0 && userIntroductions.length === 0) {
        return {
          text: "# Match & Introduction Status\n\n## Current Primary Status: no_matches\nYou have no matches or introduction requests yet. Consider sharing more about your interests, goals, and what kind of connections you're looking for.\n\n## Recommended Actions\n- **Find New Matches**: Share more about your background, interests, and goals to help find potential connections.",
          data: { matchCount: 0, introductionCount: 0 },
          values: { statusSummary: 'No matches or introductions found yet.' },
        };
      }

      // Categorize matches by status using new status system
      const matchStatusCategories = {
        match_found: [] as any[],
        proposal_pending: [] as any[],
        accepted: [] as any[],
        declined: [] as any[],
        connected: [] as any[],
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
            content: matchData, // Include full match data for proposalInitiator checks
          });
        }
      });

      // Categorize introductions by status
      const introductionCategories = {
        sent: [] as any[],
        received: [] as any[],
        accepted: [] as any[],
        declined: [] as any[],
      };

      userIntroductions.forEach((intro) => {
        const introData = intro.content as any;
        const status = introData.status;

        if (status === 'proposal_sent') {
          if (introData.fromUserId === userId) {
            introductionCategories.sent.push({
              introId: intro.id,
              otherUserId: introData.toUserId,
              message: introData.introductionMessage,
              createdAt: intro.createdAt,
            });
          } else {
            introductionCategories.received.push({
              introId: intro.id,
              otherUserId: introData.fromUserId,
              message: introData.introductionMessage,
              createdAt: intro.createdAt,
            });
          }
        } else if (status === 'accepted') {
          introductionCategories.accepted.push({
            introId: intro.id,
            otherUserId:
              introData.fromUserId === userId ? introData.toUserId : introData.fromUserId,
            createdAt: intro.createdAt,
          });
        } else if (status === 'declined') {
          introductionCategories.declined.push({
            introId: intro.id,
            otherUserId:
              introData.fromUserId === userId ? introData.toUserId : introData.fromUserId,
            createdAt: intro.createdAt,
          });
        }
      });

      // Build comprehensive status summary
      let statusSummary = `# Match & Introduction Status\n\n`;

      // Determine primary status and add explanation (considering both matches and introductions)
      let primaryStatus = 'none';
      let statusExplanation = '';

      if (introductionCategories.received.length > 0) {
        primaryStatus = 'introduction_requests_received';
        statusExplanation = 'The user has received introduction requests that need their response.';
      } else if (matchStatusCategories.match_found.length > 0) {
        primaryStatus = 'matches_ready';
        statusExplanation = 'The user has matches ready to request introductions for.';
      } else if (matchStatusCategories.proposal_pending.length > 0) {
        // Check if user is initiator or receiver
        const userIsInitiator = matchStatusCategories.proposal_pending.some((match) => {
          const matchData = match.content || {};
          return matchData.proposalInitiator === userId;
        });

        if (userIsInitiator) {
          primaryStatus = 'proposals_sent';
          statusExplanation =
            'The user has introduction proposals sent out, waiting for responses.';
        } else {
          primaryStatus = 'proposals_received';
          statusExplanation =
            'The user has received introduction proposals that need their response.';
        }
      } else if (introductionCategories.sent.length > 0) {
        primaryStatus = 'introduction_requests_sent';
        statusExplanation = 'The user has sent introduction requests, waiting for responses.';
      } else if (
        matchStatusCategories.accepted.length > 0 ||
        introductionCategories.accepted.length > 0
      ) {
        primaryStatus = 'connections_accepted';
        statusExplanation = 'The user has accepted connections that should be active.';
      } else if (matchStatusCategories.connected.length > 0) {
        primaryStatus = 'connections_made';
        statusExplanation = 'The user has successful connections established.';
      }

      statusSummary += `## Current Primary Status: ${primaryStatus}\n${statusExplanation}\n\n`;

      // Detailed breakdown
      if (matchStatusCategories.match_found.length > 0) {
        statusSummary += `## Matches Ready for Introduction: ${matchStatusCategories.match_found.length}\n`;
        statusSummary += `Status Meaning: These matches are ready for you to request introductions.\n`;
        matchStatusCategories.match_found.forEach((match, index) => {
          statusSummary += `  ${index + 1}. Match with ${match.otherUserId} (Score: ${match.compatibilityScore})\n`;
        });
        statusSummary += '\n';
      }

      if (matchStatusCategories.proposal_pending.length > 0) {
        const sentProposals = matchStatusCategories.proposal_pending.filter((match) => {
          const matchData = match.content || {};
          return matchData.proposalInitiator === userId;
        });
        const receivedProposals = matchStatusCategories.proposal_pending.filter((match) => {
          const matchData = match.content || {};
          return matchData.proposalInitiator !== userId;
        });

        if (sentProposals.length > 0) {
          statusSummary += `## Introduction Proposals Sent - Awaiting Response: ${sentProposals.length}\n`;
          statusSummary += `Status Meaning: You requested introductions to these people, waiting for their response.\n`;
          sentProposals.forEach((match, index) => {
            statusSummary += `  ${index + 1}. Sent to ${match.otherUserId} (Score: ${match.compatibilityScore})\n`;
          });
          statusSummary += '\n';
        }

        if (receivedProposals.length > 0) {
          statusSummary += `## Introduction Proposals Received - Awaiting Your Response: ${receivedProposals.length}\n`;
          statusSummary += `Status Meaning: These people want to connect with you, waiting for your acceptance or decline.\n`;
          receivedProposals.forEach((match, index) => {
            statusSummary += `  ${index + 1}. From ${match.otherUserId} (Score: ${match.compatibilityScore})\n`;
          });
          statusSummary += '\n';
        }
      }

      if (matchStatusCategories.accepted.length > 0) {
        statusSummary += `## Accepted Connections: ${matchStatusCategories.accepted.length}\n`;
        statusSummary += `Status Meaning: These connections have been accepted and should be active.\n`;
        matchStatusCategories.accepted.forEach((match, index) => {
          statusSummary += `  ${index + 1}. Accepted with ${match.otherUserId} (Score: ${match.compatibilityScore})\n`;
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
        statusSummary += `## Declined Matches: ${matchStatusCategories.declined.length}\n`;
        statusSummary += `Status Meaning: These match introduction attempts were declined by either the user or the other party.\n`;
      }

      // Introduction breakdown sections
      if (introductionCategories.received.length > 0) {
        statusSummary += `## Introduction Requests Received - Need Your Response: ${introductionCategories.received.length}\n`;
        statusSummary += `Status Meaning: These people want to connect with you. You need to respond with "Yes, I accept" or "No, not interested".\n`;
        introductionCategories.received.forEach((intro, index) => {
          const truncatedMessage =
            intro.message?.substring(0, 100) + (intro.message?.length > 100 ? '...' : '');
          statusSummary += `  ${index + 1}. From ${intro.otherUserId}: "${truncatedMessage}"\n`;
        });
        statusSummary += '\n';
      }

      if (introductionCategories.sent.length > 0) {
        statusSummary += `## Introduction Requests Sent - Awaiting Response: ${introductionCategories.sent.length}\n`;
        statusSummary += `Status Meaning: You've sent introduction requests to these people, waiting for their response.\n`;
        introductionCategories.sent.forEach((intro, index) => {
          statusSummary += `  ${index + 1}. Sent to ${intro.otherUserId}\n`;
        });
        statusSummary += '\n';
      }

      if (introductionCategories.accepted.length > 0) {
        statusSummary += `## Successful Introduction Connections: ${introductionCategories.accepted.length}\n`;
        statusSummary += `Status Meaning: These introduction requests were accepted and connections are established.\n`;
        introductionCategories.accepted.forEach((intro, index) => {
          statusSummary += `  ${index + 1}. Connected with ${intro.otherUserId}\n`;
        });
        statusSummary += '\n';
      }

      if (introductionCategories.declined.length > 0) {
        statusSummary += `## Declined Introduction Requests: ${introductionCategories.declined.length}\n`;
        statusSummary += `Status Meaning: These introduction requests were declined by either you or the other party.\n`;
      }

      // Add recommended actions section
      statusSummary += `## Recommended Actions\n`;

      // Priority: Introduction requests received (highest priority)
      if (introductionCategories.received.length > 0) {
        statusSummary += `- **⏰ URGENT: Respond to Introduction Requests**: You have ${introductionCategories.received.length} people waiting for your response. Say "yes" or "accept" to connect, or "no" or "decline" to pass.\n`;
      }

      // Secondary: Matches ready for introduction requests
      if (matchStatusCategories.match_found.length > 0) {
        statusSummary += `- **Request Introductions**: Say "I would like an introduction" or "Yes, connect us" to request introductions for your ${matchStatusCategories.match_found.length} match(es).\n`;
      }

      // Tertiary: Respond to match-level proposals
      const receivedProposals = matchStatusCategories.proposal_pending.filter((match) => {
        const matchData = match.content || {};
        return matchData.proposalInitiator !== userId;
      });
      if (receivedProposals.length > 0) {
        statusSummary += `- **Respond to Match Proposals**: Say "Yes, I accept" or "No, not interested" to respond to match introduction requests.\n`;
      }

      // Fallback: Find new matches if no active workflow
      if (
        matchStatusCategories.match_found.length === 0 &&
        matchStatusCategories.proposal_pending.length === 0 &&
        matchStatusCategories.accepted.length === 0 &&
        introductionCategories.received.length === 0 &&
        introductionCategories.sent.length === 0
      ) {
        statusSummary += `- **Find New Matches**: You can search for new connections by providing more details about your interests and goals.\n`;
      }

      return {
        text: statusSummary,
        data: {
          matchCount: userMatches.length,
          introductionCount: userIntroductions.length,
          categories: matchStatusCategories,
          introductionCategories: introductionCategories,
        },
        values: {
          statusSummary,
          primaryStatus,
          pendingMatches: matchStatusCategories.match_found.length,
          pendingProposals: matchStatusCategories.proposal_pending.length,
          receivedIntroductions: introductionCategories.received.length,
          sentIntroductions: introductionCategories.sent.length,
          acceptedConnections:
            matchStatusCategories.accepted.length + introductionCategories.accepted.length,
          totalConnections:
            matchStatusCategories.connected.length + introductionCategories.accepted.length,
        },
      };
    } catch (error) {
      logger.error(`[discover-connection] Error in match state provider: ${error}`);
      return {
        text: '# Match & Introduction Status\n\n## Status: Error\nUnable to retrieve match and introduction status information at this time. Please try again later.',
        data: { error: true },
        values: { statusSummary: 'Error retrieving match and introduction status' },
      };
    }
  },
};

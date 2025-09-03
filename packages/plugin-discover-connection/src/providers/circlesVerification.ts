import {
  type IAgentRuntime,
  type Memory,
  type Provider,
  type ProviderResult,
  type State,
  logger,
} from '@elizaos/core';

const circlesVerificationProvider: Provider = {
  name: 'CIRCLES_VERIFICATION',
  description: 'Provides narrative context for users in the Circles network verification process',
  get: async (runtime: IAgentRuntime, message: Memory, _state: State): Promise<ProviderResult> => {
    try {
      // Check if user has matches with 'circles_verification_needed' status
      const matches = await runtime.getMemories({
        tableName: 'matches',
        count: 50,
      });

      const verificationMatches = matches.filter((match) => {
        const matchData = match.content as any;
        return (
          (matchData.user1Id === message.entityId || matchData.user2Id === message.entityId) &&
          matchData.status === 'circles_verification_needed'
        );
      });

      // Only provide context if user is in verification process
      if (verificationMatches.length === 0) {
        return {
          data: { verificationContext: '' },
        };
      }

      // Get verification stage and data
      const verificationRecords = await runtime.getMemories({
        tableName: 'circles_verification',
        entityId: message.entityId,
        count: 1,
      });

      let currentStage = 'metri_account';
      let verificationData: any = {};

      if (verificationRecords.length > 0) {
        verificationData = verificationRecords[0].content as any;
        currentStage = verificationData.stage || 'metri_account';
      }

      // Generate narrative context based on stage
      const verificationNarrativeContext = `# Circles Network Verification Assistant

You're helping a user who wants to join Paren's network but needs Circles network verification first.

## Context
- User found a match but isn't a verified Circles network member yet
- They need verification (3 members trusting them) before joining Paren's group
- We're collecting info to help them get verified by other Circles members

## Current Verification Stage: ${currentStage}

### Phase 1: Metri Account (current: ${currentStage === 'metri_account' ? 'ACTIVE' : currentStage === 'social_links' || currentStage === 'ready' ? 'COMPLETED' : 'PENDING'})
${
  currentStage === 'metri_account'
    ? `
**CURRENT TASK**: Ask if they have a Metri account
- If yes: "Great! Could you share your Metri account address?"
- If no: "You'll need to create a Metri account first for Circles network identity"
- Explain: "This is for your Circles network identity verification"
`
    : verificationData.metriAccount
      ? `✅ Completed - Metri account: ${verificationData.metriAccount}`
      : ''
}

### Phase 2: Social Proof (current: ${currentStage === 'social_links' ? 'ACTIVE' : currentStage === 'ready' ? 'COMPLETED' : 'PENDING'})
${
  currentStage === 'social_links'
    ? `
**CURRENT TASK**: Request social links that showcase their work/passion
- Ask for: "Could you share links to your work? This could be your X/Twitter, GitHub, personal website, or anything that showcases your passion?"
- Explain: "These help potential Circles members verify your identity and interests when considering trusting you"
- Be encouraging: "The more you can show about your work and interests, the easier it'll be for members to trust you"
`
    : verificationData.socialLinks && verificationData.socialLinks.length > 0
      ? `✅ Completed - Social links: ${verificationData.socialLinks.join(', ')}`
      : ''
}

### Phase 3: Ready for Introductions (current: ${currentStage === 'ready' ? 'ACTIVE' : 'PENDING'})
${
  currentStage === 'ready'
    ? `
**CURRENT TASK**: Confirm info collected and explain next steps
- Confirm: "Perfect! I now have your Metri account and social links"
- Explain: "You can now receive introductions to other Circles members who might trust you"
- Note: "Once 3 members trust you in the Circles network, you'll be verified and can join Paren's group directly"
`
    : ''
}

## Tone and Approach
- Warm and supportive - this process can feel daunting
- **One question per message** - don't overwhelm them
- Explain WHY each piece of information is needed
- Be encouraging about their verification journey
- Clarify that verification happens through connections with other members

## CRITICAL: Only ask for information relevant to current stage
- Don't ask about social links until Metri account is complete
- Don't rush through stages
- Always explain the purpose behind requests

Remember: You're helping them become a verified Circles network member so they can join Paren's group for introductions.`;

      logger.debug(
        `[circles-verification-provider] Provided narrative context for user ${message.entityId}, stage: ${currentStage}`
      );

      return {
        data: { verificationContext: verificationNarrativeContext },
      };
    } catch (error) {
      logger.error(`[circles-verification-provider] Error getting verification context: ${error}`);
      return {
        data: { verificationContext: '' },
      };
    }
  },
};

export { circlesVerificationProvider };

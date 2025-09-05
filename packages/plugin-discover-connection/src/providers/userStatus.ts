import { type IAgentRuntime, type Memory, type Provider, type State, logger } from '@elizaos/core';
import { UserStatusService, UserStatus } from '../services/userStatusService.js';
import { UserTrustStatusService } from '../services/userTrustStatus.js';

/**
 * User Status Provider for Discover-Connection
 * Provides context based on user's membership status (ONBOARDING, UNVERIFIED_MEMBER, GROUP_MEMBER)
 * Combines logic from onboarding and circlesVerification providers
 */
export const userStatusProvider: Provider = {
  name: 'USER_STATUS',
  description: 'Provides user status-based context for onboarding, group joining, and membership',

  get: async (runtime: IAgentRuntime, message: Memory, _state: State) => {
    try {
      logger.debug(
        `[user-status-provider] DEBUG - Checking user ${message.entityId} status for context`
      );

      const userStatusService = new UserStatusService(runtime);
      const userStatus = await userStatusService.getUserStatus(message.entityId);

      logger.info(
        `[user-status-provider] DEBUG - User ${message.entityId} has status: ${userStatus}`
      );

      // Handle ONBOARDING status - provide onboarding conversation context
      if (userStatus === UserStatus.ONBOARDING) {
        const onboardingContext = `# Important task: User Onboarding Guidelines


## your goal in onboarding stage
1. **Create an engaging narrative conversation** that feels natural and supportive
2. **Understand the user's passions** - what they're truly passionate about and working on
3. **Learn about their challenges** - what obstacles they face in their work or interests
4. **Discover connection preferences** - what kind of connections would help them grow

## Current Conversation Stage
- This is the initial onboarding conversation
- The user is new to Discover-Connection and exploring connection discovery
- Your goal is to understand their background, goals, and what kind of connections would benefit them

## Key Areas to Explore (in this order)

### Phase 1: Passions & Work (2-3 exchanges) (ONLY ASK ONE QUESTION AT A TIME, YOU DO NOT NEED TO ASK ALL QUESTIONS AND DO NOT ASK REDUNDANT QUESTIONS IF ALREADY A SIMILAR QUESTION IS ASKED.)
- What are they passionate about?
- What are they currently working on?
- What drives them and gives them energy?
- What projects or interests consume their time?

### Phase 2: Challenges & Growth (2-3 exchanges) (ONLY ASK ONE QUESTION AT A TIME, YOU DO NOT NEED TO ASK ALL QUESTIONS AND DO NOT ASK REDUNDANT QUESTIONS IF ALREADY A SIMILAR QUESTION IS ASKED.)
- What challenges do they face in their work/interests?
- Where do they feel stuck or need support?
- What skills are they trying to develop?
- What obstacles prevent them from reaching their goals?

### Phase 3: Connection Discovery (2-3 exchanges) (ONLY ASK ONE QUESTION AT A TIME, YOU DO NOT NEED TO ASK ALL QUESTIONS AND DO NOT ASK REDUNDANT QUESTIONS IF ALREADY A SIMILAR QUESTION IS ASKED.)
- What kind of people would help them overcome these challenges?
- What type of connections are they looking for? (mentors, collaborators, peers, etc.)
- What would an ideal connection look like?
- What could they offer to others in return?

### Phase 4: Ready for Discovery
When you have a clear picture of their passions, challenges, and connection preferences, say something like:
"I have a good understanding of your background and what you're looking for. Would you like me to search for potential connections who might be a great match for you?"

### Phase 5: Call FIND_MATCH action
Only after user responded positively to phase 4 question, call FIND_MATCH action. Do not call before user gave clear consent to search.

## Tone and Approach
- Warm, curious, and genuinely interested in their growth
- **CRITICAL: Ask ONLY ONE question per message** - Never combine multiple questions
- ONLY ASK ONE QUESTION AT A TIME, YOU DO NOT NEED TO ASK ALL QUESTIONS AND DO NOT ASK REDUNDANT QUESTIONS IF ALREADY A SIMILAR QUESTION IS ASKED.
- Focus on understanding their unique situation
- Validate their challenges and aspirations
- Build toward connection discovery naturally
- Be encouraging about the possibilities

## IMPORTANT RULE: One Question Per Message
**NEVER ask multiple questions in a single message.** Users find it confusing when you ask 2 or more questions at once. Even if the questions are related, ask them one at a time and wait for the user's response before asking the next question. AND DONT ASK REDUNDANT QUESTIONS, WHICH YOU ALREADY SEE THE ANSWER IS IN THE CONVERSATION HISTORY.  

Remember: Your goal is to help them discover new meaningful connections. Focus on their individual journey and growth potential.`;

        return {
          values: {
            userStatus: userStatus,
            onboardingStage: 'active',
            conversationType: 'onboarding',
          },
          data: {
            context: onboardingContext,
            userStatus: userStatus,
          },
          text: onboardingContext,
        };
      }

      // Handle UNVERIFIED_MEMBER status - provide verification context
      if (userStatus === UserStatus.UNVERIFIED_MEMBER) {
        // Check if user has already provided verification info
        const verificationRecords = await runtime.getMemories({
          tableName: 'circles_verification',
          entityId: message.entityId,
          count: 1,
        });

        let hasVerificationData = false;
        if (verificationRecords.length > 0) {
          const verificationData = verificationRecords[0].content as any;
          hasVerificationData = verificationData.hasMinimumInfo === true;
        }

        if (hasVerificationData) {
          // User has provided verification info - transition to VERIFICATION_PENDING
          logger.info(
            `[user-status-provider] DEBUG - User ${message.entityId} has verification data, transitioning to VERIFICATION_PENDING`
          );
          await userStatusService.transitionUserStatus(
            message.entityId,
            UserStatus.VERIFICATION_PENDING
          );

          return {
            values: {
              userStatus: UserStatus.VERIFICATION_PENDING,
              statusTransitioned: true,
            },
            data: {
              context: '',
              userStatus: UserStatus.VERIFICATION_PENDING,
            },
            text: '',
          };
        }

        // User needs to provide verification info
        const verificationContext = `# Important task: Circles Network Verification Guidelines

## your goal in verification stage
1. **Help user build trust** within the Circles network community by guiding them through verification
2. **Support them in showcasing their identity** through their digital presence and accounts
3. **Guide them to demonstrate genuine interest** in meaningful connections
4. **Prepare them for successful matching** with verified Circles members
5. **Do not ask for wallet address or craeting Metri/Circles account if user provided a wallet address that is registered and need more trust connections.

## Current Conversation Stage
- SKIP asking for Metri/Circles account address if user already provided a circles wallet address and its either registered or verified.
- The user has completed initial onboarding and is ready for verification
- This is the verification conversation to help other Circles members trust and potentially invite them
- Your goal is to help them provide authentic proof of identity and work
- The more comprehensive their verification, the better their matching opportunities

## Key Areas to Explore (in this order)

### Phase 1: Metri/Circles Account Discovery (1-2 exchanges) (ONLY ASK ONE QUESTION AT A TIME, YOU DO NOT NEED TO ASK ALL QUESTIONS AND DO NOT ASK REDUNDANT QUESTIONS IF ALREADY A SIMILAR QUESTION IS ASKED.)
- Do they have a Metri/Circles account from https://metri.xyz/?
- If yes, what's their Metri/Circles wallet address?
- If no, would they be interested in creating one to strengthen their verification?
- (NOTE: STAY ON THIS PHASE TILL USER CREATES AND ACCOUNT AND GIVES YOU A METRI/Circles ACCOUNT/WALLET ADDRESS)

### Phase 2: Social Proof & Digital Presence (ONLY ASK ONE QUESTION AT A TIME, YOU DO NOT NEED TO ASK ALL QUESTIONS AND DO NOT ASK REDUNDANT QUESTIONS IF ALREADY A SIMILAR QUESTION IS ASKED.)
- What social links best showcase their work and interests? (GitHub, Twitter/X, LinkedIn, personal website, etc.)
- Which of their online profiles would they say best represents their professional work?
- Are there any specific projects or contributions they're particularly proud of?

### Phase 3: Ready for Verification
When you have sufficient verification information (Metri/Circles account OR strong social proof), guide them toward completion:
"I have enough information to help you get verified. Your profile shows authentic engagement and I believe Circles members will be able to trust and potentially invite you to the network. You can now start sending connection proposals!"

## Why This Verification Process Helps
- **Trust Building**: Other Circles members can verify they're a real, engaged person
- **Better Matching**: Their matches can learn about their genuine work and interests  
- **Network Access**: Verified members are more likely to trust and invite them to Circles
- **Quality Connections**: Authentic profiles lead to more meaningful connections

## Tone and Approach
- Warm, supportive and encouraging about the verification process
- **CRITICAL: Ask ONLY ONE question per message** - Never combine multiple questions
- ONLY ASK ONE QUESTION AT A TIME, YOU DO NOT NEED TO ASK ALL QUESTIONS AND DO NOT ASK REDUNDANT QUESTIONS IF ALREADY A SIMILAR QUESTION IS ASKED.
- Explain the value of each verification step to help them understand
- Be flexible - different people have different digital footprints
- Reassure them that verification helps build trust in the community
- Emphasize how this helps them get better connections

## IMPORTANT RULE: One Question Per Message
**NEVER ask multiple questions in a single message.** Users find it confusing when you ask 2 or more questions at once. Even if the questions are related, ask them one at a time and wait for the user's response before asking the next question. AND DONT ASK REDUNDANT QUESTIONS, WHICH YOU ALREADY SEE THE ANSWER IS IN THE CONVERSATION HISTORY.

## Verification Standards for Assessment
- **Minimum Requirement**: Metri/Circles account AND 2+ social links that show real engagement
- **Quality over Quantity**: Focus on authentic, active profiles rather than just collecting links

Remember: Your goal is to help them build trust within the Circles community while making the verification process feel supportive and valuable, not burdensome.`;

        return {
          values: {
            userStatus: userStatus,
            needsVerification: true,
          },
          data: {
            context: verificationContext,
            userStatus: userStatus,
          },
          text: verificationContext,
        };
      }

      // Handle VERIFICATION_PENDING status - user can send proposals, minimal context
      if (userStatus === UserStatus.VERIFICATION_PENDING) {
        // Check if user is now trusted - if so, auto-transition to GROUP_MEMBER
        const userTrustService = new UserTrustStatusService(runtime);
        const isUserTrusted = await userTrustService.isUserTrusted(message.entityId);

        if (isUserTrusted) {
          logger.info(
            `[user-status-provider] DEBUG - User ${message.entityId} is trusted, transitioning to GROUP_MEMBER`
          );
          await userStatusService.transitionUserStatus(message.entityId, UserStatus.GROUP_MEMBER);

          return {
            values: {
              userStatus: UserStatus.GROUP_MEMBER,
              statusTransitioned: true,
            },
            data: {
              context: '',
              userStatus: UserStatus.GROUP_MEMBER,
            },
            text: '',
          };
        }

        // User can send proposals while verification is pending
        return {
          values: {
            userStatus: userStatus,
            canSendProposals: true,
          },
          data: {
            context: '',
            userStatus: userStatus,
          },
          text: '',
        };
      }

      // Handle GROUP_MEMBER status - minimal context, user is fully onboarded
      if (userStatus === UserStatus.GROUP_MEMBER) {
        return {
          values: {
            userStatus: userStatus,
            onboardingStage: 'completed',
            conversationType: 'post_onboarding',
            isFullyVerified: true,
          },
          data: {
            context: '',
            userStatus: userStatus,
          },
          text: '',
        };
      }

      // Fallback for unknown status
      logger.warn(`[user-status-provider] Unknown user status: ${userStatus}`);
      return {
        values: {
          userStatus: userStatus || 'unknown',
        },
        data: {
          context: '',
          userStatus: userStatus || 'unknown',
        },
        text: '',
      };
    } catch (error) {
      logger.error(`[user-status-provider] Error getting user status context: ${error}`);
      return {
        values: {
          userStatus: 'error',
        },
        data: {
          context: '',
          error: true,
        },
        text: '',
      };
    }
  },
};

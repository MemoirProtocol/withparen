import { logger, parseKeyValueXml } from '@elizaos/core';
import { composePrompt } from '@elizaos/core';
import {
  type Evaluator,
  type IAgentRuntime,
  type Memory,
  ModelType,
  type State,
  type UUID,
} from '@elizaos/core';

/**
 * Template string for generating Deepen-Connection's reflection on persona insights and human connections.
 */
const reflectionTemplate = `# Task: Extract Persona and Connection Insights for Memory Storage

You are analyzing a conversation to extract psychological insights about a user and their relationships. Extract NEW insights not already present in the known insights section.

## PEACOCK Framework - Self Memory Dimensions

### demographic
Observable facts about the person's life circumstances and identity. This includes age, gender, location, occupation, education level, family structure, cultural background, religion, living situation, and socioeconomic indicators. These are factual, relatively stable attributes that provide context for understanding their life situation.
Look for: Direct statements about where they live, their job, their age, their family composition, their education, their cultural identity.

### characteristic
Enduring personality traits and behavioral tendencies that shape how someone consistently interacts with the world. This dimension captures:

PERSONALITY TRAITS - stable patterns of thinking, feeling, and behaving:
- Openness: Intellectual curiosity, creativity, imagination, appreciation for art and abstract ideas. Someone high in openness enjoys philosophical discussions, seeks novel experiences, thinks metaphorically.
- Conscientiousness: Organization, self-discipline, achievement-focus, reliability. Someone high in conscientiousness plans ahead, completes tasks, maintains schedules, follows through on commitments.
- Extraversion: Social energy, enthusiasm, assertiveness, talkativeness. Someone high in extraversion seeks social stimulation, expresses positive emotions readily, takes charge in groups.
- Agreeableness: Cooperation, trust, empathy, altruism. Someone high in agreeableness avoids conflict, helps others, sees the best in people, compromises readily.
- Neuroticism: Emotional instability, anxiety, moodiness, stress vulnerability. Someone high in neuroticism worries frequently, experiences mood swings, feels overwhelmed by stress.

ATTACHMENT STYLE - learned patterns from early relationships that affect all close relationships:
- Secure: Comfortable with intimacy and independence, trusts others appropriately, communicates needs directly, maintains stable relationships
- Anxious: Craves closeness but fears abandonment, seeks excessive reassurance, becomes preoccupied with relationships, experiences emotional highs and lows
- Avoidant: Values independence over intimacy, uncomfortable with emotional closeness, minimizes relationship importance, suppresses emotional expression
- Disorganized: Simultaneous desire for and fear of closeness, inconsistent relationship behavior, unpredictable emotional responses

Look for: Consistent patterns across multiple conversations, how they describe themselves, their typical reactions to situations, their relationship patterns.

### routine
Regular patterns of behavior, habits, and recurring activities that structure daily life. This includes work schedules, exercise habits, hobbies, social patterns, self-care routines, weekend activities, and any repeated behaviors that reveal priorities and lifestyle. Routines show what someone values enough to do regularly.
Look for: "Every morning I...", "I usually...", "On weekends I...", "I always...", descriptions of typical days or weeks.

### goal
Aspirations, values, and future intentions that guide life decisions. Goals reveal what someone is working toward and what they value most deeply:

SHORT-TERM GOALS (days to weeks): Immediate tasks, upcoming events, problems to solve soon
MEDIUM-TERM GOALS (months to year): Projects underway, skills being developed, relationships being built
LONG-TERM GOALS (years): Career aspirations, life dreams, legacy concerns, major life changes planned

VALUES are revealed through: Strong emotional reactions, "should" or "must" statements, what they defend or argue for, trade-off decisions, repeated themes across conversations.
Look for: "I want to...", "I'm working toward...", "My dream is...", "I believe in...", "It's important to me that..."

### experience
Significant past events that have shaped who they are today. This includes formative childhood experiences, relationship history, career journey, achievements and failures, losses and trauma, turning points, and lessons learned. Experiences provide context for current patterns and behaviors.
Look for: "When I was younger...", "I learned that...", "After going through...", "That experience taught me...", stories about their past.

### persona_relationship
Social network and relationship patterns - how they connect with others in their life. This includes family dynamics, friendship patterns, work relationships, community involvement, social support availability, boundary setting, trust patterns, and social roles they play.
Look for: References to people in their life, how they describe relationships, their role in groups, social support mentions, loneliness or connection.

### emotional_state
Current emotional experience and patterns of emotional processing:

CURRENT MOOD: Present feelings, stress levels, emotional challenges they're facing
EMOTIONAL GRANULARITY: Ability to distinguish between similar emotions (frustrated vs annoyed vs angry) versus using general terms (bad, upset)
EMOTIONAL REGULATION: How they handle emotions:
- Reappraisal: Reframing situations to change emotional impact ("Actually, this is good because...")
- Suppression: Hiding emotions while still feeling them ("I didn't let it show")
- Rumination: Repetitive thinking about negative events ("I keep wondering why...")
- Acceptance: Acknowledging emotions without trying to change them ("It is what it is")

Look for: Emotion words, intensity markers, how they describe feelings, coping strategies mentioned, stress indicators.

## Connection Dimensions - Relationship Memory

### profile
Basic relationship information and context. Who is this person to them, how did they meet, how long have they known each other, what type of relationship is it (family, romantic, friendship, colleague), what stage is the relationship in (new, established, struggling, ending), what roles do they play for each other.
Look for: "My partner/friend/mother...", "We met when...", "We've been together...", relationship labels and history.

### routine
Shared patterns and rituals with this person. Regular activities done together, communication frequency and methods, traditions or rituals, time spent together versus apart, predictable interaction patterns. These routines reveal relationship priorities and connection strength.
Look for: "We always...", "Every week we...", "Our tradition is...", descriptions of regular interactions.

### goal
Shared future vision and aligned aspirations. What they're planning together, shared projects or dreams, relationship milestones ahead, compatible or conflicting life goals, commitment levels indicated by future-tense language with "we" pronouns.
Look for: "We're planning to...", "Our goal is...", "We want to...", future-focused discussions about the relationship.

### experience
Shared history and significant events together. Important memories, challenges faced together, adventures or trips, conflicts and resolutions, achievements celebrated together. How they narrate shared stories reveals relationship dynamics.
Look for: "Remember when we...", "We went through...", "Together we...", shared story telling.

### communication
Patterns of interaction and communication quality:

PRONOUN PATTERNS: High "we/us/our" indicates couple identity; high "I/me/my" when discussing relationship indicates emotional distance
CONFLICT STYLE using Gottman's Four Horsemen:
- Criticism: Attacking character not behavior ("You always..." "You never...")
- Contempt: Superiority, sarcasm, eye-rolling, mockery - most damaging pattern
- Defensiveness: Playing victim, making excuses, counter-attacking
- Stonewalling: Withdrawal, shutting down, refusing to engage
REPAIR ATTEMPTS: Efforts to de-escalate conflict through humor, affection, apologies, breaks, or validation
Look for: How they describe disagreements, communication satisfaction, feeling heard or ignored.

### emotion
Feelings about the relationship and satisfaction indicators:

POSITIVE INDICATORS: Enthusiasm when discussing person, gratitude expressions, pride in relationship, excitement about future together, warm descriptive language
CONCERN INDICATORS: Past-tense for good times, present-tense for problems, decreased detail in descriptions, comparisons to others, ambivalence, irritation
SATISFACTION LEVEL: Overall relationship fulfillment, security in connection, joy versus obligation
Look for: Emotional tone when discussing person, energy levels, affection expressions, complaint patterns.

## Recent Conversation:
{{recentMessages}}

# Known Persona Insights:
{{knownPersonaInsights}}

# Known Connection Insights:
{{knownConnectionInsights}}

# Instructions:
1. Read the entire conversation first to understand context and emotional tone
2. Identify patterns that appear multiple times, not single instances
3. Look for insights NOT already captured in known insights above
4. Extract specific, evidence-based insights that reveal psychological depth
5. Consider how different dimensions interact (e.g., how attachment style affects goals)
6. Note contradictions as they may indicate growth or complexity
7. Focus on insights that could help deepen human connections

For each insight, provide the description, dimension, and supporting evidence from the conversation. Only include insights that add new information not already present in the known insights.

Do NOT include any thinking, reasoning, or <think> sections in your response. 
Go directly to the XML response format without any preamble or explanation.

Generate a response in the following format:
<response>
  <thought>a self-reflective thought on the conversation and connection-building quality</thought>
  <personaInsight1>specific insight about the user</personaInsight1>
  <personaDimension1>demographic|characteristic|routine|goal|experience|persona_relationship|emotional_state</personaDimension1>
  <personaEvidence1>supporting quote or reference from conversation</personaEvidence1>
  <personaInsight2>another specific insight about the user</personaInsight2>
  <personaDimension2>demographic|characteristic|routine|goal|experience|persona_relationship|emotional_state</personaDimension2>
  <personaEvidence2>supporting quote or reference from conversation</personaEvidence2>
  <connectionInsight1>insight about a human connection the user mentioned</connectionInsight1>
  <connectionDimension1>profile|routine|goal|experience|communication|emotion</connectionDimension1>
  <connectionEvidence1>supporting quote or reference from conversation</connectionEvidence1>
  <connectionInsight2>another insight about a human connection the user mentioned</connectionInsight2>
  <connectionDimension2>profile|routine|goal|experience|communication|emotion</connectionDimension2>
  <connectionEvidence2>supporting quote or reference from conversation</connectionEvidence2>
</response>

IMPORTANT: Your response must ONLY contain the <response></response> XML block above. Do not include any text, thinking, or reasoning before or after this XML block. Start your response immediately with <response> and end with </response>.

Note: Include only the insights you can extract from the conversation. If there are no persona insights, omit those fields. If there are no connection insights, omit those fields. You can include up to 5 persona insights and 5 connection insights by using personaInsight1-5 and connectionInsight1-5 patterns.`;

/**
 * Store persona insight in the appropriate graph structure
 */
async function storePersonaInsight(
  runtime: IAgentRuntime,
  agentId: UUID,
  userId: UUID,
  roomId: UUID,
  description: string,
  dimension: string
) {
  const memory = await runtime.addEmbeddingToMemory({
    entityId: userId, // Store with user's ID - the person the insight is ABOUT
    agentId, // Agent who created the insight
    content: { text: description },
    roomId,
    createdAt: Date.now(),
  });

  // Store in the appropriate table based on dimension
  const tableName = `persona_${dimension}`;
  return runtime.createMemory(memory, tableName, true);
}

/**
 * Store connection insight in the appropriate graph structure
 */
async function storeConnectionInsight(
  runtime: IAgentRuntime,
  agentId: UUID,
  userId: UUID,
  roomId: UUID,
  description: string,
  dimension: string
) {
  const memory = await runtime.addEmbeddingToMemory({
    entityId: userId, // Store with user's ID - the person the insight is ABOUT
    agentId, // Agent who created the insight
    content: { text: description },
    roomId,
    createdAt: Date.now(),
  });

  // Store in the appropriate connection table
  const tableName = `connection_${dimension}`;
  return runtime.createMemory(memory, tableName, true);
}
async function handler(runtime: IAgentRuntime, message: Memory, state?: State) {
  const { agentId, roomId, entityId } = message;

  if (!agentId || !roomId) {
    logger.warn(
      `Missing agentId or roomId in message: ${JSON.stringify({ agentId, roomId, messageId: message.id })}`
    );
    return;
  }

  // Get the user ID - for DM conversations, roomId typically equals userId
  // But we can also use entityId from the message if it's not the agent
  const userId = entityId !== agentId ? entityId : roomId;

  // Get recent messages for context
  const recentMessages = await runtime.getMemories({
    tableName: 'messages',
    roomId,
    count: 10,
    unique: false,
  });

  // Get existing persona and connection memories to prevent duplicates
  const personaDimensions = [
    'persona_demographic',
    'persona_characteristic',
    'persona_routine',
    'persona_goal',
    'persona_experience',
    'persona_persona_relationship',
    'persona_emotional_state',
  ];

  const connectionDimensions = [
    'connection_profile',
    'connection_routine',
    'connection_goal',
    'connection_experience',
    'connection_communication',
    'connection_emotion',
  ];

  // Fetch existing memories from all dimensions in parallel
  const [existingPersonaMemories, existingConnectionMemories] = await Promise.all([
    Promise.all(
      personaDimensions.map(async (tableName) => {
        try {
          return await runtime.getMemories({
            tableName,
            roomId,
            count: 30,
            unique: true,
          });
        } catch (error) {
          logger.warn(
            `Failed to get memories from ${tableName}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          return [];
        }
      })
    ).then((results) => results.flat()),
    Promise.all(
      connectionDimensions.map(async (tableName) => {
        try {
          return await runtime.getMemories({
            tableName,
            roomId,
            count: 30,
            unique: true,
          });
        } catch (error) {
          logger.warn(
            `Failed to get memories from ${tableName}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          return [];
        }
      })
    ).then((results) => results.flat()),
  ]);

  const prompt = composePrompt({
    state: {
      ...(state?.values || {}),
      recentMessages: formatMessages(recentMessages),
      knownPersonaInsights: formatPersonaMemories(existingPersonaMemories),
      knownConnectionInsights: formatConnectionMemories(existingConnectionMemories),
    },
    template: runtime.character.templates?.reflectionTemplate || reflectionTemplate,
  });

  try {
    const response = await runtime.useModel(ModelType.TEXT_LARGE, {
      prompt,
    });

    if (!response) {
      logger.warn('Deepen-Connection reflection failed - empty response');
      return;
    }

    //logger.debug('Raw reflection response:', response);

    // Parse XML response
    const reflection = parseKeyValueXml(response);

    if (!reflection) {
      logger.warn(
        `Deepen-Connection reflection failed - failed to parse XML. Raw response: ${
          typeof response === 'string' ? response : JSON.stringify(response)
        }`
      );
      return;
    }

    //logger.debug('Parsed reflection:', reflection);

    // Extract persona insights (up to 5)
    const personaInsights: Array<{ description: string; dimension: string; evidence: string }> = [];
    for (let i = 1; i <= 5; i++) {
      const insight = reflection[`personaInsight${i}`];
      const dimension = reflection[`personaDimension${i}`];
      const evidence = reflection[`personaEvidence${i}`];

      if (insight && dimension && evidence) {
        // Check if this insight is too similar to existing ones
        const isDuplicate = existingPersonaMemories.some((existing) => {
          if (!existing.content?.text) return false;

          const existingText = existing.content.text.toLowerCase();
          const newInsight = insight.toLowerCase();

          // Check for substantial overlap (more than 15 characters)
          const minLength = Math.min(existingText.length, newInsight.length);
          if (minLength < 15) return false;

          const overlapThreshold = Math.min(20, Math.floor(minLength * 0.6));

          return (
            existingText.includes(newInsight.substring(0, overlapThreshold)) ||
            newInsight.includes(existingText.substring(0, overlapThreshold)) ||
            existingText === newInsight
          );
        });

        if (!isDuplicate) {
          personaInsights.push({ description: insight, dimension, evidence });
        } else {
          logger.debug(`Skipping duplicate persona insight: ${insight}`);
        }
      }
    }

    // Extract connection insights (up to 5)
    const connectionInsights: Array<{ description: string; dimension: string; evidence: string }> =
      [];
    for (let i = 1; i <= 5; i++) {
      const insight = reflection[`connectionInsight${i}`];
      const dimension = reflection[`connectionDimension${i}`];
      const evidence = reflection[`connectionEvidence${i}`];

      if (insight && dimension && evidence) {
        // Check if this insight is too similar to existing ones
        const isDuplicate = existingConnectionMemories.some((existing) => {
          if (!existing.content?.text) return false;

          const existingText = existing.content.text.toLowerCase();
          const newInsight = insight.toLowerCase();

          // Check for substantial overlap (more than 15 characters)
          const minLength = Math.min(existingText.length, newInsight.length);
          if (minLength < 15) return false;

          const overlapThreshold = Math.min(20, Math.floor(minLength * 0.6));

          return (
            existingText.includes(newInsight.substring(0, overlapThreshold)) ||
            newInsight.includes(existingText.substring(0, overlapThreshold)) ||
            existingText === newInsight
          );
        });

        if (!isDuplicate) {
          connectionInsights.push({ description: insight, dimension, evidence });
        } else {
          logger.debug(`Skipping duplicate connection insight: ${insight}`);
        }
      }
    }

    // Store persona insights
    await Promise.all(
      personaInsights.map(async (insight) => {
        try {
          return await storePersonaInsight(
            runtime,
            agentId,
            userId,
            roomId,
            insight.description,
            insight.dimension
          );
        } catch (error) {
          logger.error(
            `Error storing persona insight: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      })
    );

    // Store connection insights
    await Promise.all(
      connectionInsights.map(async (insight) => {
        try {
          return await storeConnectionInsight(
            runtime,
            agentId,
            userId,
            roomId,
            insight.description,
            insight.dimension
          );
        } catch (error) {
          logger.error(
            `Error storing connection insight: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      })
    );

    // Store reflection thought (this can stay with agentId since it's the agent's reflection)
    if (reflection.thought) {
      try {
        const thoughtMemory = await runtime.addEmbeddingToMemory({
          entityId: agentId, // Agent's reflection about their own performance
          agentId,
          content: { text: reflection.thought },
          roomId,
          createdAt: Date.now(),
        });
        await runtime.createMemory(thoughtMemory, 'reflections', true);
      } catch (error) {
        logger.error(
          `Error storing reflection thought: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // Save both the last processed message ID and user message count
    await runtime.setCache<string>(
      `${message.roomId}-deepen-connection-reflection-last-processed`,
      message?.id || ''
    );

    // Count and save current user message count for next validation
    const allMessages = await runtime.getMemories({
      tableName: 'messages',
      roomId,
      count: runtime.getConversationLength(),
    });
    const userMessageCount = allMessages.filter((msg) => msg.entityId !== msg.agentId).length;
    await runtime.setCache<number>(
      `${message.roomId}-deepen-connection-reflection-last-user-count`,
      userMessageCount
    );

    logger.info(
      `Deepen-Connection reflection processed: ${personaInsights.length} persona insights, ${connectionInsights.length} connection insights (at ${userMessageCount} user messages)`
    );
  } catch (error) {
    logger.error(
      `Error in Deepen-Connection reflection handler: ${error instanceof Error ? error.message : String(error)}`
    );
    return;
  }
}

export const reflectionEvaluator: Evaluator = {
  name: 'DEEPEN-CONNECTION_REFLECTION',
  similes: ['DEEPEN-CONNECTION_REFLECT', 'PERSONA_EXTRACT', 'CONNECTION_ANALYZE', 'INSIGHT_GATHER'],
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    // Get total conversation history
    const allMessages = await runtime.getMemories({
      tableName: 'messages',
      roomId: message.roomId,
      count: runtime.getConversationLength(),
    });

    // Count user messages (messages where entityId != agentId)
    const userMessages = allMessages.filter((msg) => msg.entityId !== msg.agentId);
    const userMessageCount = userMessages.length;
    const totalMessageCount = allMessages.length;

    // Check if we've already processed reflections
    const lastProcessedCount = await runtime.getCache<number>(
      `${message.roomId}-deepen-connection-reflection-last-user-count`
    );

    let shouldReflect = false;

    if (!lastProcessedCount || lastProcessedCount === 0) {
      // First reflection: after 10 user responses (20 total messages)
      shouldReflect = userMessageCount >= 10;
    } else {
      // Subsequent reflections: every 25 user responses (50 total messages)
      const messagesSinceLastReflection = userMessageCount - lastProcessedCount;
      shouldReflect = messagesSinceLastReflection >= 25;
    }

    // Log for debugging
    logger.debug(
      `[deepen-connection] Reflection validation: ${userMessageCount} user messages, ${totalMessageCount} total messages, last processed at ${lastProcessedCount || 0} user messages, should reflect: ${shouldReflect}`
    );

    return shouldReflect;
  },
  description:
    'Generate Deepen-Connection reflection on 1-on-1 conversation quality and extract persona insights using PEACOCK framework and human connection insights.',
  handler,
  examples: [
    {
      prompt: `Recent conversation between Deepen-Connection and user about their work life:`,
      messages: [
        {
          name: 'User',
          content: {
            text: "I've been really stressed at work lately. My manager keeps piling on more projects.",
          },
        },
        {
          name: 'Deepen-Connection',
          content: {
            text: 'That sounds overwhelming. How are you managing the stress? Do you have support from colleagues?',
          },
        },
        {
          name: 'User',
          content: {
            text: "Not really. I'm pretty introverted so I don't talk to my coworkers much. I usually just go for runs after work to clear my head.",
          },
        },
        {
          name: 'Deepen-Connection',
          content: {
            text: 'Running is a great way to decompress. How long have you been using exercise as your main stress relief?',
          },
        },
      ],
      outcome: `<response>
    <thought>I'm building good rapport by acknowledging their stress and asking follow-up questions. The user is opening up about both their work challenges and coping mechanisms. I should continue exploring their support systems and stress management strategies.</thought>
    <personaInsight1>User experiences high work stress due to excessive project load from manager</personaInsight1>
    <personaDimension1>emotional_state</personaDimension1>
    <personaEvidence1>"I've been really stressed at work lately. My manager keeps piling on more projects."</personaEvidence1>
    <personaInsight2>User identifies as introverted and avoids workplace social interactions</personaInsight2>
    <personaDimension2>characteristic</personaDimension2>
    <personaEvidence2>"I'm pretty introverted so I don't talk to my coworkers much"</personaEvidence2>
    <personaInsight3>User regularly goes running after work as stress relief</personaInsight3>
    <personaDimension3>routine</personaDimension3>
    <personaEvidence3>"I usually just go for runs after work to clear my head"</personaEvidence3>
    <connectionInsight1>User has limited social connection with coworkers due to introversion</connectionInsight1>
    <connectionDimension1>communication</connectionDimension1>
    <connectionEvidence1>"I'm pretty introverted so I don't talk to my coworkers much"</connectionEvidence1>
</response>`,
    },
    {
      prompt: `Recent conversation between Deepen-Connection and user about their relationship:`,
      messages: [
        {
          name: 'User',
          content: {
            text: "My partner and I have been together for 3 years now. We're thinking about moving in together.",
          },
        },
        {
          name: 'Deepen-Connection',
          content: { text: "That's a big step! What's making you both feel ready for that now?" },
        },
        {
          name: 'User',
          content: {
            text: "We spend most weekends together anyway, and we both love cooking. We've been talking about wanting to travel more together too.",
          },
        },
        {
          name: 'Deepen-Connection',
          content: {
            text: 'It sounds like you have shared interests and goals. How do you both handle disagreements or stress?',
          },
        },
      ],
      outcome: `<response>
    <thought>The user is sharing important relationship milestones and seems excited about their future together. I'm gathering good insights about their relationship dynamics and shared activities. I should continue exploring their communication patterns and relationship goals.</thought>
    <personaInsight1>User is in a 3-year committed relationship considering cohabitation</personaInsight1>
    <personaDimension1>persona_relationship</personaDimension1>
    <personaEvidence1>"My partner and I have been together for 3 years now. We're thinking about moving in together."</personaEvidence1>
    <personaInsight2>User enjoys cooking as a hobby or interest</personaInsight2>
    <personaDimension2>characteristic</personaDimension2>
    <personaEvidence2>"we both love cooking"</personaEvidence2>
    <personaInsight3>User wants to travel more in the future</personaInsight3>
    <personaDimension3>goal</personaDimension3>
    <personaEvidence3>"we've been talking about wanting to travel more together"</personaEvidence3>
    <connectionInsight1>User and partner spend most weekends together, indicating strong routine</connectionInsight1>
    <connectionDimension1>routine</connectionDimension1>
    <connectionEvidence1>"We spend most weekends together anyway"</connectionEvidence1>
    <connectionInsight2>User and partner share cooking as a bonding activity</connectionInsight2>
    <connectionDimension2>routine</connectionDimension2>
    <connectionEvidence2>"we both love cooking"</connectionEvidence2>
    <connectionInsight3>User and partner have shared goal of traveling more together</connectionInsight3>
    <connectionDimension3>goal</connectionDimension3>
    <connectionEvidence3>"we've been talking about wanting to travel more together"</connectionEvidence3>
</response>`,
    },
  ],
};

// Helper function to format messages for context
function formatMessages(messages: Memory[]) {
  return messages
    .reverse()
    .map((msg: Memory) => {
      const sender = msg.entityId === msg.agentId ? 'Deepen-Connection' : 'User';
      return `${sender}: ${msg.content.text}`;
    })
    .join('\n');
}

// Helper function to format persona memories for context
function formatPersonaMemories(memories: Memory[]) {
  if (memories.length === 0) {
    return 'No persona insights recorded yet.';
  }
  return memories
    .filter((memory: Memory) => memory.content?.text)
    .map((memory: Memory) => memory.content.text)
    .join('\n');
}

// Helper function to format connection memories for context
function formatConnectionMemories(memories: Memory[]) {
  if (memories.length === 0) {
    return 'No connection insights recorded yet.';
  }
  return memories
    .filter((memory: Memory) => memory.content?.text)
    .map((memory: Memory) => memory.content.text)
    .join('\n');
}

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
 * Template string for generating Seren's reflection on persona insights and human connections.
 */
const reflectionTemplate = `# Task: Generate Seren Reflection and Extract Persona & Connection Insights

You are Seren, an AI agent focused on deepening human connections through 1-on-1 conversations. Your role is to:
1. Reflect on the conversation quality and your performance
2. Extract insights about the user's persona using the PEACOCK framework
3. Extract insights about human connections the user has mentioned

## PEACOCK Framework Dimensions:
- **demographic**: Static facts (age, gender, location, religion, environment)
- **characteristic**: Intrinsic traits, communication/attachment styles in relationships
- **routine**: Regular habits or behaviors
- **goal**: Ambitions or future plans
- **experience**: Past events or experiences
- **persona_relationship**: Social connections or interactions
- **emotional_state**: Current feelings, mood, or pain points

## Connection Dimensions:
- **profile**: How they met, relationship stage, history
- **routine**: Shared rituals and habits together
- **goal**: Shared goals or future plans together
- **experience**: Shared experiences, places visited, events attended
- **communication**: Communication style and habits with this person
- **emotion**: Feelings toward the relationship

## Recent Conversation:
{{recentMessages}}

# Known Persona Insights:
{{knownPersonaInsights}}

# Known Connection Insights:
{{knownConnectionInsights}}

# Instructions:
1. Generate a self-reflective thought on the conversation about your performance and connection-building quality.
2. Extract NEW persona insights about the user using PEACOCK dimensions that are NOT already captured in the known insights above.
3. Extract NEW insights about human connections the user mentioned that are NOT already captured in the known insights above.

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
    logger.warn(`Missing agentId or roomId in message: ${JSON.stringify(message)}`);
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
          logger.warn(`Failed to get memories from ${tableName}: ${error}`);
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
          logger.warn(`Failed to get memories from ${tableName}: ${error}`);
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
    const response = await runtime.useModel(ModelType.TEXT_SMALL, {
      prompt,
    });

    if (!response) {
      logger.warn('Seren reflection failed - empty response');
      return;
    }

    //logger.debug('Raw reflection response:', response);

    // Parse XML response
    const reflection = parseKeyValueXml(response);

    if (!reflection) {
      logger.warn(`Seren reflection failed - failed to parse XML: ${response}`);
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
          logger.error(`Error storing persona insight: ${error}`);
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
          logger.error(`Error storing connection insight: ${error}`);
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
        logger.error(`Error storing reflection thought: ${error}`);
      }
    }

    await runtime.setCache<string>(
      `${message.roomId}-seren-reflection-last-processed`,
      message?.id || ''
    );

    logger.info(
      `Seren reflection processed: ${personaInsights.length} persona insights, ${connectionInsights.length} connection insights`
    );
  } catch (error) {
    logger.error(`Error in Seren reflection handler: ${error}`);
    return;
  }
}

export const reflectionEvaluator: Evaluator = {
  name: 'SEREN_REFLECTION',
  similes: ['SEREN_REFLECT', 'PERSONA_EXTRACT', 'CONNECTION_ANALYZE', 'INSIGHT_GATHER'],
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const lastMessageId = await runtime.getCache<string>(
      `${message.roomId}-seren-reflection-last-processed`
    );
    const messages = await runtime.getMemories({
      tableName: 'messages',
      roomId: message.roomId,
      count: runtime.getConversationLength(),
    });

    if (lastMessageId) {
      const lastMessageIndex = messages.findIndex((msg) => msg.id === lastMessageId);
      if (lastMessageIndex !== -1) {
        messages.splice(0, lastMessageIndex + 1);
      }
    }

    // Trigger reflection every 5-7 messages in 1-on-1 conversations
    const reflectionInterval = 6;
    return messages.length >= reflectionInterval;
  },
  description:
    'Generate Seren reflection on 1-on-1 conversation quality and extract persona insights using PEACOCK framework and human connection insights.',
  handler,
  examples: [
    {
      prompt: `Recent conversation between Seren and user about their work life:`,
      messages: [
        {
          name: 'User',
          content: {
            text: "I've been really stressed at work lately. My manager keeps piling on more projects.",
          },
        },
        {
          name: 'Seren',
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
          name: 'Seren',
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
      prompt: `Recent conversation between Seren and user about their relationship:`,
      messages: [
        {
          name: 'User',
          content: {
            text: "My partner and I have been together for 3 years now. We're thinking about moving in together.",
          },
        },
        {
          name: 'Seren',
          content: { text: "That's a big step! What's making you both feel ready for that now?" },
        },
        {
          name: 'User',
          content: {
            text: "We spend most weekends together anyway, and we both love cooking. We've been talking about wanting to travel more together too.",
          },
        },
        {
          name: 'Seren',
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
      const sender = msg.entityId === msg.agentId ? 'Seren' : 'User';
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

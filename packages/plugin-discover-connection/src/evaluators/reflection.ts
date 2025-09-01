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
 * Template string for generating Discover-Connection's reflection on persona insights and connection preferences.
 */
const reflectionTemplate = `# Task: Generate Discover-Connection Reflection and Extract Persona & Connection Discovery Insights

You are Discover-Connection, an AI agent focused on connection discovery. Your role is to:
1. Reflect on the conversation quality and your performance
2. Extract insights about the user's persona using the PEACOCK framework
3. Extract insights about the type of connections the user wishes to discover

## PEACOCK Framework Dimensions:
- **demographic**: Static facts (age, gender, location, religion, environment)
- **characteristic**: Intrinsic traits, communication/attachment styles in relationships
- **routine**: Regular habits or behaviors
- **goal**: Ambitions or future plans
- **experience**: Past events or experiences
- **persona_relationship**: Social connections or interactions
- **emotional_state**: Current feelings, mood, or pain points

## Connection Discovery Dimensions:
- **desired_type**: Type of connection they're seeking (mentor, collaborator, peer, etc.)
- **desired_background**: Background/expertise they want in connections
- **desired_goals**: Goals they want to share with connections
- **desired_experience**: Experiences they want connections to have
- **desired_communication**: Communication style they prefer in connections
- **desired_value**: What value they want to exchange with connections

## Recent Conversation:
{{recentMessages}}

# Known Persona Insights:
{{knownPersonaInsights}}

# Known Connection Discovery Insights:
{{knownConnectionInsights}}

# Instructions:
1. Generate a self-reflective thought on the conversation about your performance and connection discovery quality.
2. Extract NEW persona insights about the user using PEACOCK dimensions that are NOT already captured in the known insights above.
3. Extract NEW insights about the type of connections the user wants to discover that are NOT already captured in the known insights above.

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
  <connectionInsight1>insight about the type of connection the user wants to discover</connectionInsight1>
  <connectionDimension1>desired_type|desired_background|desired_goals|desired_experience|desired_communication|desired_value</connectionDimension1>
  <connectionEvidence1>supporting quote or reference from conversation</connectionEvidence1>
  <connectionInsight2>another insight about the type of connection the user wants to discover</connectionInsight2>
  <connectionDimension2>desired_type|desired_background|desired_goals|desired_experience|desired_communication|desired_value</connectionDimension2>
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
    'connection_desired_type',
    'connection_desired_background',
    'connection_desired_goals',
    'connection_desired_experience',
    'connection_desired_communication',
    'connection_desired_value',
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
      logger.warn('Discover-Connection reflection failed - empty response');
      return;
    }

    //logger.debug('Raw reflection response:', response);

    // Parse XML response
    const reflection = parseKeyValueXml(response);

    if (!reflection) {
      logger.warn(`Discover-Connection reflection failed - failed to parse XML: ${response}`);
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
      `${message.roomId}-discover-connection-reflection-last-processed`,
      message?.id || ''
    );

    logger.info(
      `Discover-Connection reflection processed: ${personaInsights.length} persona insights, ${connectionInsights.length} connection discovery insights`
    );
  } catch (error) {
    logger.error(`Error in Discover-Connection reflection handler: ${error}`);
    return;
  }
}

export const reflectionEvaluator: Evaluator = {
  name: 'DISCOVER-CONNECTION_REFLECTION',
  similes: [
    'DISCOVER-CONNECTION_REFLECT',
    'PERSONA_EXTRACT',
    'CONNECTION_DISCOVER',
    'INSIGHT_GATHER',
  ],
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    try {
      const lastMessageId = await runtime.getCache<string>(
        `${message.roomId}-discover-connection-reflection-last-processed`
      );
      const messages = await runtime.getMemories({
        tableName: 'messages',
        roomId: message.roomId,
        count: 20, // Use fixed count instead of getConversationLength()
      });

      if (lastMessageId) {
        const lastMessageIndex = messages.findIndex((msg) => msg.id === lastMessageId);
        if (lastMessageIndex !== -1) {
          messages.splice(0, lastMessageIndex + 1);
        }
      }

      // Trigger reflection every 4-5 messages to ensure we capture insights early
      const reflectionInterval = 4;
      const shouldReflect = messages.length >= reflectionInterval;

      logger.debug(
        `[discover-connection] Reflection validation: ${messages.length} messages since last reflection, should reflect: ${shouldReflect}`
      );
      return shouldReflect;
    } catch (error) {
      logger.error(`[discover-connection] Error in reflection validation: ${error}`);
      return false;
    }
  },
  description:
    'Generate Discover-Connection reflection on 1-on-1 conversation quality and extract persona insights using PEACOCK framework and connection discovery preferences.',
  handler,
  examples: [
    {
      prompt: `Recent conversation between Discover-Connection and user about their work and connection needs:`,
      messages: [
        {
          name: 'User',
          content: {
            text: "I'm working on a sustainable tech startup but I'm struggling with the technical aspects. I need someone who really understands clean energy.",
          },
        },
        {
          name: 'Discover-Connection',
          content: {
            text: 'That sounds like an exciting venture! What specific technical challenges are you facing? And what kind of expertise would be most helpful?',
          },
        },
        {
          name: 'User',
          content: {
            text: "Mainly battery storage optimization. I'd love to connect with someone who has experience in energy storage systems, maybe someone who's been through the startup journey before.",
          },
        },
        {
          name: 'Discover-Connection',
          content: {
            text: 'A mentor with both technical expertise and startup experience would be invaluable. What would you hope to offer in return to someone like that?',
          },
        },
      ],
      outcome: `<response>
    <thought>I'm effectively identifying the user's specific technical needs and connection preferences. They're being clear about wanting both technical expertise and startup experience, which gives me good direction for potential matches. I should continue exploring what they can offer in return.</thought>
    <personaInsight1>User is working on a sustainable tech startup focused on clean energy</personaInsight1>
    <personaDimension1>goal</personaDimension1>
    <personaEvidence1>"I'm working on a sustainable tech startup"</personaEvidence1>
    <personaInsight2>User faces technical challenges specifically in battery storage optimization</personaInsight2>
    <personaDimension2>experience</personaDimension2>
    <personaEvidence2>"Mainly battery storage optimization"</personaEvidence2>
    <connectionInsight1>User wants to connect with someone who has energy storage systems expertise</connectionInsight1>
    <connectionDimension1>desired_background</connectionDimension1>
    <connectionEvidence1>"I'd love to connect with someone who has experience in energy storage systems"</connectionEvidence1>
    <connectionInsight2>User seeks a mentor who has been through the startup journey</connectionInsight2>
    <connectionDimension2>desired_type</connectionDimension2>
    <connectionEvidence2>"maybe someone who's been through the startup journey before"</connectionEvidence2>
</response>`,
    },
    {
      prompt: `Recent conversation between Discover-Connection and user about their creative pursuits and collaboration needs:`,
      messages: [
        {
          name: 'User',
          content: {
            text: "I'm a freelance graphic designer but I want to get into UX design. I feel like I need to collaborate with developers to really understand the technical side.",
          },
        },
        {
          name: 'Discover-Connection',
          content: {
            text: "That's a natural progression! What aspects of UX design are you most excited about? And what kind of collaboration are you envisioning?",
          },
        },
        {
          name: 'User',
          content: {
            text: "I love the problem-solving aspect and user research. I'd love to work on a side project with a developer who's patient and willing to teach. Maybe someone who also wants to learn more about design.",
          },
        },
        {
          name: 'Discover-Connection',
          content: {
            text: 'A mutual learning partnership sounds perfect. What design skills could you share in return?',
          },
        },
      ],
      outcome: `<response>
    <thought>The user is clearly articulating their career transition goals and the type of collaborative relationship they want. They're looking for mutual learning, which is great for finding compatible connections. I'm getting good insights about both their skills and what they want to learn.</thought>
    <personaInsight1>User is a freelance graphic designer transitioning to UX design</personaInsight1>
    <personaDimension1>goal</personaDimension1>
    <personaEvidence1>"I'm a freelance graphic designer but I want to get into UX design"</personaEvidence1>
    <personaInsight2>User is passionate about problem-solving and user research aspects of UX</personaInsight2>
    <personaDimension2>characteristic</personaDimension2>
    <personaEvidence2>"I love the problem-solving aspect and user research"</personaEvidence2>
    <connectionInsight1>User wants to collaborate with developers to learn technical aspects</connectionInsight1>
    <connectionDimension1>desired_background</connectionDimension1>
    <connectionEvidence1>"I need to collaborate with developers to really understand the technical side"</connectionEvidence1>
    <connectionInsight2>User seeks a patient mentor willing to teach development concepts</connectionInsight2>
    <connectionDimension2>desired_communication</connectionDimension2>
    <connectionEvidence2>"a developer who's patient and willing to teach"</connectionEvidence2>
    <connectionInsight3>User wants mutual learning partnership where they can teach design</connectionInsight3>
    <connectionDimension3>desired_value</connectionDimension3>
    <connectionEvidence3>"someone who also wants to learn more about design"</connectionEvidence3>
</response>`,
    },
  ],
};

// Helper function to format messages for context
function formatMessages(messages: Memory[]) {
  return messages
    .reverse()
    .map((msg: Memory) => {
      const sender = msg.entityId === msg.agentId ? 'Discover-Connection' : 'User';
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

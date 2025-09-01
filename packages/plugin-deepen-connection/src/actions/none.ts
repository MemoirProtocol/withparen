import type { Action, ActionExample, IAgentRuntime, Memory, ActionResult } from '@elizaos/core';

/**
 * Represents the none action.
 *
 * This action responds but performs no additional action. It is the default if the agent is speaking and not doing anything additional.
 *
 * @type {Action}
 */
/**
 * Represents an action that responds but performs no additional action.
 * This is the default behavior if the agent is speaking and not doing anything additional.
 * @type {Action}
 */
export const noneAction: Action = {
  name: 'NONE',
  similes: ['NO_ACTION', 'NO_RESPONSE', 'NO_REACTION'],
  validate: async (_runtime: IAgentRuntime, _message: Memory) => {
    return true;
  },
  description:
    'Respond but perform no additional action. This is the default if the agent is speaking and not doing anything additional.',
  handler: async (_runtime: IAgentRuntime, _message: Memory): Promise<ActionResult> => {
    return {
      text: 'No additional action taken',
      values: {
        success: true,
        actionType: 'NONE',
      },
      data: {
        actionName: 'NONE',
        description: 'Response without additional action',
      },
      success: true,
    };
  },
  examples: [] as ActionExample[][],
} as Action;

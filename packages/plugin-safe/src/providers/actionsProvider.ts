import type { Action, IAgentRuntime, Memory, Provider, State } from '@elizaos/core';
import { addHeader, composeActionExamples, formatActionNames, formatActions } from '@elizaos/core';

/**
 * Provider for Safe wallet actions
 * 
 * Makes Safe wallet actions (CHECK_BALANCE, SEND_ETH) available to the agent's prompt.
 * Wallets are now created automatically, so CREATE_WALLET is no longer needed.
 */
export const safeActionsProvider: Provider = {
  name: 'SAFE_ACTIONS',
  description: 'Available Safe wallet actions and their usage',
  position: -1, // High priority provider
  get: async (runtime: IAgentRuntime, message: Memory, state: State) => {
    // Filter for Safe wallet actions specifically (CREATE_WALLET removed - wallets created automatically)
    const safeActionNames = ['CHECK_BALANCE', 'SEND_ETH'];
    const safeActions = runtime.actions.filter((action: Action) => 
      safeActionNames.includes(action.name)
    );

    // Get actions that validate for this message
    const actionPromises = safeActions.map(async (action: Action) => {
      try {
        const result = await action.validate(runtime, message, state);
        if (result) {
          return action;
        }
      } catch (e) {
        console.error('SAFE_ACTIONS GET -> validate err', action, e);
      }
      return null;
    });

    const resolvedActions = await Promise.all(actionPromises);
    const actionsData = resolvedActions.filter(Boolean) as Action[];

    if (actionsData.length === 0) {
      return {
        text: '',
        data: { actionsData: [] },
        values: {},
      };
    }

    // Format action-related texts
    const actionNames = `Available Safe wallet actions: ${formatActionNames(actionsData)}`;

    const actionsWithDescriptions = addHeader(
      '# Safe Wallet Actions', 
      formatActions(actionsData)
    );

    const actionExamples = addHeader(
      '# Safe Wallet Action Examples', 
      composeActionExamples(actionsData, 5)
    );

    const data = {
      actionsData,
    };

    const values = {
      actionNames,
      actionExamples,
      actionsWithDescriptions,
    };

    // Combine all text sections
    const text = [actionNames, actionsWithDescriptions, actionExamples]
      .filter(Boolean)
      .join('\n\n');

    return {
      data,
      values,
      text,
    };
  },
};
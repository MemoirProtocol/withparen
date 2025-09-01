import {
  type Action,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelType,
  type State,
  parseKeyValueXml,
  composePromptFromState,
  ActionResult,
} from '@elizaos/core';
import {
  parseAbi,
  encodeFunctionData,
  type Address,
} from 'viem';

import { type WalletProvider, initWalletProvider } from '../providers/wallet';
import { trustTemplate } from '../templates';
import type { Transaction, TrustParams, TrustParamsRaw } from '../types';

// Exported for tests
export class TrustAction {
  constructor(private walletProvider: WalletProvider) { }

  async trust(params: TrustParams): Promise<Transaction> {
    const walletClient = this.walletProvider.getWalletClient(params.chain);

    if (!walletClient.account) {
      throw new Error('Wallet account is not available');
    }

    try {
      // Get the Circles Group contract address from environment
      const circlesGroupCA = process.env.CIRCLES_GROUP_CA;
      if (!circlesGroupCA) {
        throw new Error('CIRCLES_GROUP_CA environment variable is not set');
      }

      console.log(
        `Processing trust operation for ${params.trustReceiver} with expiry ${params.expiry}`
      );

      // Encode the trust function call
      const trustData = encodeFunctionData({
        abi: parseAbi(['function trust(address _trustReceiver, uint96 _expiry)']),
        functionName: 'trust',
        args: [params.trustReceiver, params.expiry],
      });

      const transactionParams = {
        account: walletClient.account,
        to: circlesGroupCA as Address,
        value: 0n, // No ETH value needed for trust operation
        data: trustData,
        chain: walletClient.chain,
      };

      const hash = await walletClient.sendTransaction(transactionParams);
      console.log(`Trust transaction sent successfully. Hash: ${hash}`);

      return {
        hash,
        from: walletClient.account.address,
        to: circlesGroupCA as Address,
        value: 0n,
        data: trustData,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Trust operation failed: ${errorMessage}`);
    }
  }
}

const buildTrustDetails = async (
  state: State,
  _message: Memory,
  runtime: IAgentRuntime,
  wp: WalletProvider
): Promise<TrustParams> => {
  const chains = wp.getSupportedChains();

  state = await runtime.composeState(_message, ['RECENT_MESSAGES'], true);
  state.supportedChains = chains.join(' | ');

  const context = composePromptFromState({
    state,
    template: trustTemplate,
  });

  const xmlResponse = await runtime.useModel(ModelType.TEXT_SMALL, {
    prompt: context,
  });

  const parsedXml = parseKeyValueXml(xmlResponse);

  if (!parsedXml) {
    throw new Error('Failed to parse XML response from LLM for trust details.');
  }

  const rawTrustDetails = parsedXml as unknown as TrustParamsRaw;

  // Normalize chain name to lowercase to handle case sensitivity issues
  const normalizedChainName = rawTrustDetails.chain.toLowerCase();

  // Check if the normalized chain name exists in the supported chains
  const existingChain = wp.chains[normalizedChainName];

  if (!existingChain) {
    throw new Error(
      'The chain ' +
      rawTrustDetails.chain +
      ' not configured yet. Add the chain or choose one from configured: ' +
      chains.toString()
    );
  }

  // Convert raw data to proper types
  let expiry: bigint;
  if (!rawTrustDetails.expiry || rawTrustDetails.expiry === 'null' || rawTrustDetails.expiry === null) {
    expiry = BigInt('0x1fffffffffffff'); // Maximum uint96 value for permanent trust
  } else {
    // Convert string to BigInt if it's a valid number
    try {
      expiry = BigInt(rawTrustDetails.expiry);
    } catch (error) {
      // If conversion fails, use default permanent trust
      expiry = BigInt('0x1fffffffffffff');
    }
  }

  const trustDetails: TrustParams = {
    chain: normalizedChainName as any,
    trustReceiver: rawTrustDetails.trustReceiver as Address,
    expiry: expiry,
  };

  return trustDetails;
};

export const trustAction: Action = {
  name: 'EVM_TRUST',
  description:
    'Trust a wallet address in the Circles protocol, allowing them to receive group tokens',
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    if (!state) {
      state = (await runtime.composeState(message)) as State;
    }

    const walletProvider = await initWalletProvider(runtime);
    const action = new TrustAction(walletProvider);

    // Compose trust context
    const paramOptions = await buildTrustDetails(state, message, runtime, walletProvider);

    try {
      const trustResp = await action.trust(paramOptions);

      const successText =
        `✅ Successfully trusted ${paramOptions.trustReceiver}\n` +
        `Transaction Hash: ${trustResp.hash}`;

      if (callback) {
        callback({
          text: `Successfully trusted ${paramOptions.trustReceiver}\nTransaction Hash: ${trustResp.hash}`,
          content: {
            success: true,
            hash: trustResp.hash,
            trustReceiver: paramOptions.trustReceiver,
            expiry: paramOptions.expiry.toString(),
            chain: paramOptions.chain,
          },
        });
      }
      return {
        success: true,
        text: successText,
        values: {
          trustSucceeded: true,
          trustedAddress: paramOptions.trustReceiver,
        },
        data: {
          actionName: 'EVM_TRUST',
          transactionHash: trustResp.hash,
          fromAddress: trustResp.from,
          toAddress: trustResp.to,
          trustReceiver: paramOptions.trustReceiver,
          expiry: paramOptions.expiry.toString(),
          chain: paramOptions.chain,
        },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const failureText = `❌ Error trusting address: ${errorMessage}`;
      console.error('Error during trust operation:', errorMessage);
      if (callback) {
        callback({
          text: `Error trusting address: ${errorMessage}`,
          content: { error: errorMessage },
        });
      }
      return {
        success: false,
        text: failureText,
        values: {
          trustSucceeded: false,
          error: true,
          errorMessage,
        },
        data: {
          actionName: 'EVM_TRUST',
          error: errorMessage,
        },
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },
  validate: async (runtime: IAgentRuntime) => {
    const privateKey = runtime.getSetting('EVM_PRIVATE_KEY');
    const circlesGroupCA = runtime.getSetting('CIRCLES_GROUP_CA');
    return (
      typeof privateKey === 'string' &&
      privateKey.startsWith('0x') &&
      typeof circlesGroupCA === 'string' &&
      circlesGroupCA.startsWith('0x')
    );
  },
  examples: [
    [
      {
        name: 'assistant',
        content: {
          text: "I'll help you trust the wallet address 0x88B811419A2Ad503e53F0B208e24c99767927A",
          action: 'EVM_TRUST',
        },
      },
      {
        name: 'user',
        content: {
          text: 'Trust 0x88B811419A2Ad503e53F0B208e24c99767927A',
          action: 'EVM_TRUST',
        },
      },
    ],
  ],
  similes: ['EVM_TRUST_WALLET', 'EVM_TRUST_ADDRESS', 'CIRCLES_TRUST', 'TRUST_USER'],
};
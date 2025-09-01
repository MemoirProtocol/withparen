export * from './actions/transfer';
export * from './actions/trust';
export * from './providers/wallet';
export * from './providers/get-balance';
export * from './service';
export * from './types';

import type { Plugin } from '@elizaos/core';
import { transferAction } from './actions/transfer';
import { trustAction } from './actions/trust';
import { evmWalletProvider } from './providers/wallet';
import { tokenBalanceProvider } from './providers/get-balance';
import { EVMService } from './service';

export const circlesPlugin: Plugin = {
  name: 'circles',
  description: 'Circles blockchain integration plugin',
  providers: [evmWalletProvider, tokenBalanceProvider],
  evaluators: [],
  services: [EVMService],
  actions: [transferAction, trustAction],
};

export default circlesPlugin;

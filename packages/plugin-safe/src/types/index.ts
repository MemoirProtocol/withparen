import type { IAgentRuntime } from '@elizaos/core';

export interface UserWallet {
  userId: string;
  safeAddress: string;
  owners: string[];
  threshold: number;
  createdAt: number;
  lastUsed?: number;
  status?: 'predicted' | 'pending_deployment' | 'deployed' | 'active';
  deploymentTxHash?: string;
  moduleEnabled?: boolean;
  delegateeModule?: string;
  saltNonce?: string;
}

export interface SafeConfig {
  ETHEREUM_RPC_URL?: string;
  CHAIN_ID?: number;
  DELEGATEE_ADDRESS?: string;
  SAFE_VERSION?: string;
}

export interface TransactionRequest {
  to: string;
  value: string;
  data?: string;
  gasLimit?: string;
  gasPrice?: string;
}

export interface WalletBalance {
  address: string;
  balance: string;
  formattedBalance: string;
  symbol: string;
}

export interface SafeTransaction {
  to: string;
  value: string;
  data?: string;
  operation?: number;
  safeTxGas?: string;
  baseGas?: string;
  gasPrice?: string;
  gasToken?: string;
  refundReceiver?: string;
  nonce: number;
}
import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { createWalletProvider, type WalletType } from '../services/walletProviderFactory.js';
import { CirclesWalletProvider } from '../services/circlesWallet.js';
import { SafeCirclesWalletProvider } from '../services/safeCirclesWallet.js';
import type { IAgentRuntime } from '@elizaos/core';

// Mock runtime for testing
const createMockRuntime = (walletType: WalletType = 'EOA', extraSettings: Record<string, string> = {}): IAgentRuntime => {
  const defaultSettings = {
    EVM_WALLET_TYPE: walletType,
    EVM_PRIVATE_KEY: '0x1234567890123456789012345678901234567890123456789012345678901234',
    CIRCLES_GROUP_CA: '0x1234567890123456789012345678901234567890',
    ...(walletType === 'SAFE' && {
      SAFE_ADDRESS: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    }),
    ...extraSettings,
  };

  return {
    getSetting: mock((key: string) => defaultSettings[key]),
  } as any;
};

describe('Wallet Provider Factory', () => {
  describe('createWalletProvider', () => {
    it('should create EOA wallet provider by default', () => {
      const runtime = createMockRuntime('EOA');
      const provider = createWalletProvider(runtime);
      
      expect(provider).toBeInstanceOf(CirclesWalletProvider);
      expect(runtime.getSetting).toHaveBeenCalledWith('EVM_WALLET_TYPE');
    });

    it('should create EOA wallet provider when explicitly set to EOA', () => {
      const runtime = createMockRuntime('EOA');
      const provider = createWalletProvider(runtime);
      
      expect(provider).toBeInstanceOf(CirclesWalletProvider);
    });

    it('should create Safe wallet provider when set to SAFE', () => {
      const runtime = createMockRuntime('SAFE');
      const provider = createWalletProvider(runtime);
      
      expect(provider).toBeInstanceOf(SafeCirclesWalletProvider);
    });

    it('should default to EOA for unknown wallet types', () => {
      const runtime = createMockRuntime('UNKNOWN' as WalletType);
      const provider = createWalletProvider(runtime);
      
      expect(provider).toBeInstanceOf(CirclesWalletProvider);
    });

    it('should handle case insensitive wallet types', () => {
      const runtime = createMockRuntime();
      runtime.getSetting = mock((key: string) => key === 'EVM_WALLET_TYPE' ? 'safe' : createMockRuntime('SAFE').getSetting(key));
      
      const provider = createWalletProvider(runtime);
      expect(provider).toBeInstanceOf(SafeCirclesWalletProvider);
    });
  });

  describe('SafeCirclesWalletProvider', () => {
    it('should throw error when SAFE_ADDRESS is missing', () => {
      const runtime = createMockRuntime('SAFE', { SAFE_ADDRESS: undefined });
      
      expect(() => new SafeCirclesWalletProvider(runtime)).toThrow(
        'SAFE_ADDRESS environment variable is required and must be a valid address when using Safe wallet'
      );
    });

    it('should throw error when SAFE_ADDRESS is invalid', () => {
      const runtime = createMockRuntime('SAFE', { SAFE_ADDRESS: 'invalid-address' });
      
      expect(() => new SafeCirclesWalletProvider(runtime)).toThrow(
        'SAFE_ADDRESS environment variable is required and must be a valid address when using Safe wallet'
      );
    });

    it('should throw error when EVM_PRIVATE_KEY is missing', () => {
      const runtime = createMockRuntime('SAFE', { EVM_PRIVATE_KEY: undefined });
      
      expect(() => new SafeCirclesWalletProvider(runtime)).toThrow(
        'EVM_PRIVATE_KEY is required for Safe wallet operations'
      );
    });

    it('should initialize successfully with valid configuration', () => {
      const runtime = createMockRuntime('SAFE');
      
      expect(() => new SafeCirclesWalletProvider(runtime)).not.toThrow();
    });

    it('should return the correct Safe address', () => {
      const runtime = createMockRuntime('SAFE');
      const safeAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
      runtime.getSetting = mock((key: string) => {
        if (key === 'SAFE_ADDRESS') return safeAddress;
        return createMockRuntime('SAFE').getSetting(key);
      });
      
      const provider = new SafeCirclesWalletProvider(runtime);
      expect(provider.getAddress()).toBe(safeAddress);
    });
  });

  describe('Interface Compatibility', () => {
    it('should have compatible interfaces for both wallet types', () => {
      const eoaRuntime = createMockRuntime('EOA');
      const safeRuntime = createMockRuntime('SAFE');
      
      const eoaProvider = createWalletProvider(eoaRuntime);
      const safeProvider = createWalletProvider(safeRuntime);
      
      // Both should have the same interface methods
      expect(typeof eoaProvider.getAddress).toBe('function');
      expect(typeof eoaProvider.sendTransaction).toBe('function');
      expect(typeof safeProvider.getAddress).toBe('function');
      expect(typeof safeProvider.sendTransaction).toBe('function');
    });
  });
});
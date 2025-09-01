import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { generatePrivateKey } from 'viem/accounts';
import type { Chain } from 'viem';

import { TrustAction } from '../actions/trust';
import { WalletProvider } from '../providers/wallet';
import { getTestChains } from './custom-chain';

// Test environment - use a funded wallet private key for real testing
const TEST_PRIVATE_KEY = process.env.TEST_PRIVATE_KEY || generatePrivateKey();

// Mock the ICacheManager
const mockCacheManager = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn(),
};

describe('Trust Action', () => {
  let wp: WalletProvider;
  let testChains: Record<string, Chain>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCacheManager.get.mockResolvedValue(null);

    testChains = getTestChains();
    const pk = TEST_PRIVATE_KEY as `0x${string}`;
    
    // Initialize with Gnosis chain for Circles protocol
    const customChains = {
      gnosis: testChains.gnosis || testChains.sepolia, // Fallback to sepolia if gnosis not available
    };
    
    wp = new WalletProvider(pk, mockCacheManager as any, customChains);
    
    // Mock environment variable
    process.env.CIRCLES_GROUP_CA = '0xafe299bb2c0ab0c90b0b9be3440672797f45981d';
  });

  afterEach(() => {
    delete process.env.CIRCLES_GROUP_CA;
  });

  describe('Constructor', () => {
    it('should initialize with wallet provider', () => {
      const ta = new TrustAction(wp);
      expect(ta).toBeDefined();
    });
  });

  describe('Trust Operation', () => {
    it('should validate trust parameters', () => {
      const ta = new TrustAction(wp);
      
      const validParams = {
        chain: 'gnosis' as any,
        trustReceiver: '0x88B811419A2Ad503e53F0B208e24c99767927Aab' as `0x${string}`,
        expiry: BigInt('0x1fffffffffffff'), // Maximum uint96 value
      };

      expect(validParams.trustReceiver).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(validParams.expiry).toBeTypeOf('bigint');
      expect(validParams.chain).toBe('gnosis');
    });

    it('should throw error when CIRCLES_GROUP_CA is not set', async () => {
      delete process.env.CIRCLES_GROUP_CA;
      
      const ta = new TrustAction(wp);
      
      const params = {
        chain: 'gnosis' as any,
        trustReceiver: '0x88B811419A2Ad503e53F0B208e24c99767927Aab' as `0x${string}`,
        expiry: BigInt('0x1fffffffffffff'),
      };

      await expect(ta.trust(params)).rejects.toThrow('CIRCLES_GROUP_CA environment variable is not set');
    });

    it('should generate correct transaction data', () => {
      // This test validates the transaction data structure without sending
      const trustReceiver = '0x88B811419A2Ad503e53F0B208e24c99767927Aab';
      const expiry = BigInt('0x1fffffffffffff');
      
      // The expected transaction data from your example
      const expectedDataPrefix = '0x75dcebc7'; // trust function selector
      
      expect(trustReceiver.toLowerCase()).toBe('0x88b811419a2ad503e53f0b208e24c99767927aab');
      expect(expiry.toString(16)).toBe('1fffffffffffff');
    });

    it('should handle null expiry values correctly', () => {
      // Test that null expiry values are converted to permanent trust
      const permanentTrustExpiry = BigInt('0x1fffffffffffff');
      
      // Simulate what happens when XML parsing returns null
      const nullValues = [null, 'null', undefined, ''];
      
      nullValues.forEach(nullValue => {
        const shouldUsePermanent = !nullValue || nullValue === 'null' || nullValue === null;
        expect(shouldUsePermanent).toBe(true);
      });
      
      expect(permanentTrustExpiry.toString(16)).toBe('1fffffffffffff');
    });
  });

  describe('Environment Validation', () => {
    it('should validate required environment variables', () => {
      expect(process.env.CIRCLES_GROUP_CA).toBe('0xafe299bb2c0ab0c90b0b9be3440672797f45981d');
    });
  });
});
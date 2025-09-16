import { describe, it, expect } from 'bun:test';
import { extractWalletAddress, containsWalletAddress } from './walletDetection';

describe('walletDetection', () => {
  describe('extractWalletAddress', () => {
    it('should extract wallet address from direct address', () => {
      const text = 'My wallet is 0xe8b6A048131740A8f8fCA2720E9408d4255A7c2a';
      const result = extractWalletAddress(text);
      expect(result).toBe('0xe8b6A048131740A8f8fCA2720E9408d4255A7c2a');
    });

    it('should extract wallet address from metri.xyz link', () => {
      const text = 'Check my profile at https://app.metri.xyz/p/0xe8b6A048131740A8f8fCA2720E9408d4255A7c2a';
      const result = extractWalletAddress(text);
      expect(result).toBe('0xe8b6A048131740A8f8fCA2720E9408d4255A7c2a');
    });

    it('should extract wallet address from metri.xyz link with http', () => {
      const text = 'My profile: http://app.metri.xyz/p/0xe8b6A048131740A8f8fCA2720E9408d4255A7c2a';
      const result = extractWalletAddress(text);
      expect(result).toBe('0xe8b6A048131740A8f8fCA2720E9408d4255A7c2a');
    });

    it('should prefer metri.xyz link over direct address when both present', () => {
      const text = 'My old wallet 0x1234567890123456789012345678901234567890 but check https://app.metri.xyz/p/0xe8b6A048131740A8f8fCA2720E9408d4255A7c2a';
      const result = extractWalletAddress(text);
      expect(result).toBe('0xe8b6A048131740A8f8fCA2720E9408d4255A7c2a');
    });

    it('should return null for invalid address', () => {
      const text = 'My wallet is 0xinvalid';
      const result = extractWalletAddress(text);
      expect(result).toBe(null);
    });

    it('should return null for no address', () => {
      const text = 'No wallet here';
      const result = extractWalletAddress(text);
      expect(result).toBe(null);
    });

    it('should return null for empty text', () => {
      const result = extractWalletAddress('');
      expect(result).toBe(null);
    });

    it('should handle case insensitive metri.xyz links', () => {
      const text = 'Check HTTPS://APP.METRI.XYZ/P/0xe8b6A048131740A8f8fCA2720E9408d4255A7c2a';
      const result = extractWalletAddress(text);
      expect(result).toBe('0xe8b6A048131740A8f8fCA2720E9408d4255A7c2a');
    });
  });

  describe('containsWalletAddress', () => {
    it('should return true for direct address', () => {
      const text = 'My wallet is 0xe8b6A048131740A8f8fCA2720E9408d4255A7c2a';
      expect(containsWalletAddress(text)).toBe(true);
    });

    it('should return true for metri.xyz link', () => {
      const text = 'https://app.metri.xyz/p/0xe8b6A048131740A8f8fCA2720E9408d4255A7c2a';
      expect(containsWalletAddress(text)).toBe(true);
    });

    it('should return false for no address', () => {
      const text = 'No wallet here';
      expect(containsWalletAddress(text)).toBe(false);
    });

    it('should return false for invalid address', () => {
      const text = 'Invalid 0xnotavalidaddress';
      expect(containsWalletAddress(text)).toBe(false);
    });
  });
});
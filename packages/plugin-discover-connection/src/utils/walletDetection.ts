import { isAddress } from 'viem';

/**
 * Extracts a valid Ethereum wallet address from text, supporting both:
 * - Direct wallet addresses (0x...)
 * - Metri.xyz profile links (https://app.metri.xyz/p/0x...)
 * 
 * @param text The text to search for a wallet address
 * @returns The extracted wallet address or null if none found
 */
export function extractWalletAddress(text: string): string | null {
  if (!text) return null;
  
  // First, try to extract from metri.xyz link
  // Pattern: https://app.metri.xyz/p/[wallet_address]
  const metriLinkMatch = text.match(/https?:\/\/app\.metri\.xyz\/p\/(0x[a-fA-F0-9]{40})/i);
  if (metriLinkMatch && metriLinkMatch[1]) {
    const address = metriLinkMatch[1];
    if (isAddress(address)) {
      return address;
    }
  }
  
  // Fallback to direct wallet address detection
  const addressMatch = text.match(/0x[a-fA-F0-9]{40}/);
  if (addressMatch && isAddress(addressMatch[0])) {
    return addressMatch[0];
  }
  
  return null;
}

/**
 * Checks if text contains a wallet address (either direct or in a metri.xyz link)
 * 
 * @param text The text to check
 * @returns True if a valid wallet address is found
 */
export function containsWalletAddress(text: string): boolean {
  return extractWalletAddress(text) !== null;
}
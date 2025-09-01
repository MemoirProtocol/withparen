import { ethers } from 'ethers';
import type { MemoryDimension, MemoryDimensionType } from '../types';

/**
 * Validate memory content for publishing
 */
export function validateMemoryForPublishing(memory: MemoryDimension, minLength = 50): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check minimum content length
  if (memory.content.length < minLength) {
    errors.push(`Memory content too short: ${memory.content.length} < ${minLength} characters`);
  }

  // Check for sensitive information patterns
  const sensitivePatterns = [
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit card
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email (basic)
    /\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b/, // Phone number
  ];

  for (const pattern of sensitivePatterns) {
    if (pattern.test(memory.content)) {
      errors.push('Memory contains potential sensitive information');
      break;
    }
  }

  // Check confidence threshold
  if (memory.confidence < 0.7) {
    errors.push(`Memory confidence too low: ${memory.confidence} < 0.7`);
  }

  // Validate dimension type
  const validDimensions: MemoryDimensionType[] = [
    'demographic', 'characteristic', 'routine', 'goal', 
    'experience', 'persona_relationship', 'emotional_state'
  ];

  if (!validDimensions.includes(memory.type)) {
    errors.push(`Invalid memory dimension: ${memory.type}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Sanitize memory content for publishing
 */
export function sanitizeMemoryContent(content: string): string {
  // Remove or mask sensitive patterns
  let sanitized = content;
  
  // Mask email addresses
  sanitized = sanitized.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    '[EMAIL_REDACTED]'
  );

  // Mask phone numbers
  sanitized = sanitized.replace(
    /\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
    '[PHONE_REDACTED]'
  );

  // Mask credit card numbers
  sanitized = sanitized.replace(
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    '[CARD_REDACTED]'
  );

  // Mask SSN
  sanitized = sanitized.replace(
    /\b\d{3}-\d{2}-\d{4}\b/g,
    '[SSN_REDACTED]'
  );

  return sanitized.trim();
}

/**
 * Generate a unique filename for memory data
 */
export function generateMemoryFilename(memory: MemoryDimension): string {
  const timestamp = new Date(memory.timestamp).toISOString().replace(/[:.]/g, '-');
  const hash = ethers.keccak256(ethers.toUtf8Bytes(memory.content)).slice(2, 10);
  return `eliza-memory-${memory.type}-${timestamp}-${hash}.txt`;
}

/**
 * Format memory content for DataNFT description
 */
export function formatMemoryDescription(memory: MemoryDimension, maxLength = 300): string {
  const sanitized = sanitizeMemoryContent(memory.content);
  let description = sanitized;

  if (description.length > maxLength) {
    // Find the last complete sentence within the limit
    const truncated = description.substring(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );

    if (lastSentenceEnd > maxLength * 0.7) {
      description = truncated.substring(0, lastSentenceEnd + 1);
    } else {
      description = truncated + '...';
    }
  }

  return description;
}

/**
 * Calculate memory uniqueness score
 */
export function calculateMemoryUniqueness(
  newMemory: MemoryDimension, 
  existingMemories: MemoryDimension[]
): number {
  if (existingMemories.length === 0) return 1.0;

  let maxSimilarity = 0;

  for (const existing of existingMemories) {
    // Skip if different dimension
    if (existing.type !== newMemory.type) continue;

    // Simple similarity based on common words
    const similarity = calculateTextSimilarity(newMemory.content, existing.content);
    maxSimilarity = Math.max(maxSimilarity, similarity);
  }

  return 1 - maxSimilarity;
}

/**
 * Calculate text similarity between two strings
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Get display name for memory dimension
 */
export function getDimensionDisplayName(dimension: MemoryDimensionType): string {
  const displayNames: Record<MemoryDimensionType, string> = {
    demographic: 'Personal Demographics',
    characteristic: 'Personality Characteristics',
    routine: 'Daily Routines & Habits',
    goal: 'Goals & Ambitions',
    experience: 'Life Experiences',
    persona_relationship: 'Relationships & Social Connections',
    emotional_state: 'Emotional States & Feelings',
  };

  return displayNames[dimension] || dimension;
}

/**
 * Generate tags for DataNFT based on memory content
 */
export function generateContentTags(memory: MemoryDimension): string[] {
  const baseTags = ['eliza-memory', `dimension-${memory.type}`, 'ai-extracted'];
  
  // Add content-based tags
  const content = memory.content.toLowerCase();
  const additionalTags: string[] = [];

  // Topic-based tags
  const topicKeywords = {
    work: ['job', 'career', 'work', 'office', 'business', 'professional'],
    health: ['health', 'medical', 'doctor', 'hospital', 'wellness', 'fitness'],
    family: ['family', 'parent', 'child', 'spouse', 'sibling', 'relative'],
    education: ['school', 'university', 'study', 'learn', 'education', 'course'],
    travel: ['travel', 'trip', 'vacation', 'visit', 'journey', 'destination'],
    technology: ['computer', 'software', 'internet', 'tech', 'digital', 'online'],
    creative: ['art', 'music', 'creative', 'design', 'writing', 'painting'],
    social: ['friend', 'social', 'community', 'group', 'meeting', 'party'],
  };

  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some(keyword => content.includes(keyword))) {
      additionalTags.push(`topic-${topic}`);
    }
  }

  // Confidence-based tags
  if (memory.confidence >= 0.9) {
    additionalTags.push('high-confidence');
  } else if (memory.confidence >= 0.8) {
    additionalTags.push('medium-confidence');
  }

  // Length-based tags
  if (memory.content.length > 500) {
    additionalTags.push('detailed');
  } else if (memory.content.length > 200) {
    additionalTags.push('moderate');
  } else {
    additionalTags.push('brief');
  }

  return [...baseTags, ...additionalTags];
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

/**
 * Validate Ethereum address
 */
export function isValidEthereumAddress(address: string): boolean {
  return ethers.isAddress(address);
}

/**
 * Shorten address for display
 */
export function shortenAddress(address: string): string {
  if (!isValidEthereumAddress(address)) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Calculate estimated DataNFT value based on memory quality
 */
export function estimateMemoryValue(memory: MemoryDimension): {
  score: number;
  factors: string[];
} {
  let score = 0.5; // Base score
  const factors: string[] = [];

  // Content length factor
  if (memory.content.length > 500) {
    score += 0.2;
    factors.push('Detailed content (+0.2)');
  } else if (memory.content.length > 200) {
    score += 0.1;
    factors.push('Moderate content (+0.1)');
  }

  // Confidence factor
  if (memory.confidence >= 0.9) {
    score += 0.2;
    factors.push('High confidence (+0.2)');
  } else if (memory.confidence >= 0.8) {
    score += 0.1;
    factors.push('Good confidence (+0.1)');
  }

  // Dimension rarity factor (some dimensions are more valuable)
  const rarityBonus: Record<MemoryDimensionType, number> = {
    goal: 0.15,
    experience: 0.1,
    emotional_state: 0.1,
    characteristic: 0.05,
    persona_relationship: 0.05,
    routine: 0.0,
    demographic: 0.0,
  };

  const bonus = rarityBonus[memory.type] || 0;
  if (bonus > 0) {
    score += bonus;
    factors.push(`${getDimensionDisplayName(memory.type)} rarity (+${bonus})`);
  }

  // Cap the score at 1.0
  score = Math.min(score, 1.0);

  return { score, factors };
}
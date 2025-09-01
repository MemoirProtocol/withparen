import type { UUID } from '@elizaos/core';

/**
 * Memory dimensions following the PEACOCK framework
 */
export type MemoryDimensionType = 
  | 'demographic'
  | 'characteristic' 
  | 'routine'
  | 'goal'
  | 'experience'
  | 'persona_relationship'
  | 'emotional_state';

/**
 * Extracted memory with dimension classification
 */
export interface MemoryDimension {
  type: MemoryDimensionType;
  content: string;
  evidence: string;
  timestamp: number;
  userId: UUID;
  roomId: UUID;
  confidence: number; // 0-1 confidence score for extraction quality
}

/**
 * Ocean Protocol DataNFT metadata structure
 */
export interface DataNFTMetadata {
  name: string;
  description: string;
  author: string;
  license: string;
  tags: string[];
  type: 'dataset' | 'algorithm' | 'other';
  additionalInformation: {
    dimension: MemoryDimensionType;
    extractedAt: number;
    agentId: string;
    roomId: string;
    evidence: string;
    confidence: number;
  };
}

/**
 * Ocean Protocol DDO (Decentralized Data Object) structure
 * Based on the new Ocean Protocol DDO specification
 */
export interface OceanDDO {
  '@context': string[];
  id: string;
  version: string;
  chainId: number;
  nftAddress: string;
  metadata: {
    created: string;
    updated: string;
    type: string;
    name: string;
    description: string;
    tags: string[];
    author: string;
    license: string;
    additionalInformation: Record<string, any>;
  };
  services: OceanService[];
  credentials?: {
    allow?: { type: string; values: string[] }[];
    deny?: { type: string; values: string[] }[];
  };
  nft?: {
    address: string;
    name: string;
    symbol: string;
    tokenId?: string;
    owner: string;
    creator: string;
    created?: string;
  };
  datatokens?: OceanDatatoken[];
  event?: {
    tx?: string;
    block?: number;
    from?: string;
    contract?: string;
    datetime?: string;
  };
}

/**
 * Ocean Protocol service configuration
 */
export interface OceanService {
  id: string;
  type: 'access' | 'compute' | 'metadata';
  files: OceanFile[];
  datatokenAddress: string;
  serviceEndpoint: string;
  timeout: number;
  additionalInformation?: any;
}

/**
 * Ocean Protocol file structure
 */
export interface OceanFile {
  type: 'url' | 'ipfs' | 'graphql' | 'smartcontract' | 'arweave';
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  checksum?: string;
  checksumType?: 'MD5' | 'SHA256' | 'SHA512';
}

/**
 * Ocean Protocol datatoken configuration  
 */
export interface OceanDatatoken {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  cap: string;
  minter: string[];
  paymentCollector: string;
}

/**
 * Published asset reference stored in memory
 */
export interface PublishedAsset {
  did: string;
  nftAddress: string;
  datatokenAddress: string;
  txHash: string;
  metadata: DataNFTMetadata;
  publishedAt: number;
  userId: UUID;
  dimension: MemoryDimensionType;
}

/**
 * Ocean Node API response structure
 */
export interface OceanNodeResponse {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}

/**
 * Ocean Node publish request
 */
export interface PublishRequest {
  chainId: number;
  nftOwner: string;
  metadata: DataNFTMetadata;
  ddo: OceanDDO;
  services: OceanService[];
  datatokens?: Partial<OceanDatatoken>[];
}

/**
 * Ocean asset search/query parameters
 */
export interface AssetSearchParams {
  owner?: string;
  tags?: string[];
  text?: string;
  type?: string;
  offset?: number;
  limit?: number;
  sort?: 'created' | 'updated' | 'name' | 'relevance';
  order?: 'asc' | 'desc';
}

/**
 * Ocean asset query response
 */
export interface AssetSearchResponse {
  results: OceanDDO[];
  page: number;
  totalResults: number;
  totalPages: number;
}

/**
 * Gas estimation result
 */
export interface GasEstimation {
  gasPrice: bigint;
  gasLimit: bigint;
  totalCost: bigint;
  formatted: string;
}

/**
 * Plugin configuration
 */
export interface OceanPluginConfig {
  OCEAN_NODE_GATEWAY: string;
  OCEAN_NODE_URL: string;
  OPTIMISM_RPC_URL: string;
  OPTIMISM_CHAIN_ID: number;
  OCEAN_AUTO_PUBLISH: boolean;
  OCEAN_MIN_MEMORY_LENGTH: number;
  OCEAN_PUBLISH_INTERVAL: number;
  OCEAN_DEFAULT_LICENSE: string;
  OCEAN_TAG_PREFIX: string;
}

/**
 * Service configuration for Ocean publishing
 */
export interface OceanServiceConfig {
  runtime: any; // IAgentRuntime type will be imported from core
  chainId: number;
  gatewayUrl: string;
  nodeUrl: string;
  defaultLicense: string;
  tagPrefix: string;
}
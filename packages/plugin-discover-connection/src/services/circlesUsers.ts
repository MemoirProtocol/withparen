import { type IAgentRuntime, logger, Service, ServiceType } from '@elizaos/core';
import { createPublicClient, http } from 'viem';

/**
 * Types for Circles RPC requests and responses
 */
interface CirclesQueryRequest {
  Namespace: string;
  Table: string;
  Columns: string[];
  Filter?: FilterPredicate[];
  Order?: OrderBy[];
  Limit?: number;
  Offset?: number;
}

interface FilterPredicate {
  Type: 'FilterPredicate' | 'Conjunction';
  FilterType?: 'Equals' | 'NotEquals' | 'GreaterThan' | 'LessThan' | 'IsNull' | 'IsNotNull';
  ConjunctionType?: 'And' | 'Or';
  Column?: string;
  Value?: string | number;
  Predicates?: FilterPredicate[];
}

interface OrderBy {
  Column: string;
  SortOrder: 'ASC' | 'DESC';
}

interface PaginationCursor {
  blockNumber: number;
  transactionIndex: number;
  logIndex: number;
}

/**
 * Simplified user object for cache storage
 */
export interface CirclesUser {
  avatar: string;
  incomingTrustCount: number;
  outgoingTrustCount: number;
  isVerified: boolean;
  status: 'verified' | 'registered';
  timestamp: number;
  blockNumber?: number; // Block number for smarter duplicate detection
  transactionIndex?: number;
  logIndex?: number;
}

/**
 * Cache data structure
 */
interface CirclesUsersCache {
  users: CirclesUser[];
  totalCount: number;
  lastUpdate: number;
}

interface CirclesUsersLastUpdate {
  timestamp: number;
  usersCount: number;
}

interface CirclesUsersLastCursor {
  blockNumber: number;
  transactionIndex: number;
  logIndex: number;
  timestamp: number;
  usersCount: number;
}

// Enhanced cursor that tracks both boundaries for proper incremental updates
interface CirclesCursorBoundaries {
  highCursor: {
    blockNumber: number;
    transactionIndex: number;
    logIndex: number;
  };
  lowCursor: {
    blockNumber: number;
    transactionIndex: number;
    logIndex: number;
  };
  timestamp: number;
  usersCount: number;
}

/**
 * User status check result
 */
export interface UserStatusCheck {
  found: boolean;
  verified: boolean;
  registered: boolean;
  trustCount: number;
  needsTrusts?: number; // How many more trusts needed for verification
}

/**
 * Service for managing Circles network user verification data
 * Uses cache table for efficient storage and retrieval
 */
export class CirclesUsersService extends Service {
  private client;
  private readonly rpcUrl = 'https://rpc.circlesubi.network/';
  private readonly VERIFICATION_THRESHOLD = 3; // 3+ trusts = verified
  private readonly UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  static serviceType = ServiceType.TASK;

  constructor(runtime: IAgentRuntime) {
    super();
    this.runtime = runtime;
    this.client = createPublicClient({
      transport: http(this.rpcUrl),
    });
  }

  /**
   * Start the service
   */
  static async start(runtime: IAgentRuntime): Promise<Service> {
    const service = new CirclesUsersService(runtime);
    return service;
  }

  /**
   * Check if cached data needs updating (older than 24 hours)
   */
  async needsUpdate(): Promise<boolean> {
    try {
      const lastUpdate = await this.runtime.getCache<CirclesUsersLastUpdate>(
        'circles-users-last-update'
      );

      if (!lastUpdate) {
        logger.info('[discover-connection] No cached Circles users data found, update needed');
        return true;
      }

      const timeSinceUpdate = Date.now() - lastUpdate.timestamp;
      const updateNeeded = timeSinceUpdate >= this.UPDATE_INTERVAL_MS;

      logger.info(
        `[discover-connection] Circles users cache age: ${Math.round(timeSinceUpdate / (1000 * 60 * 60))}h, update needed: ${updateNeeded}`
      );

      return updateNeeded;
    } catch (error) {
      logger.error(`[discover-connection] Error checking if update needed: ${error}`);
      return true; // Default to updating on error
    }
  }

  /**
   * Get cached Circles users data
   */
  async getCachedCirclesUsers(): Promise<CirclesUser[]> {
    try {
      const cached = await this.runtime.getCache<CirclesUsersCache>('circles-users-data');

      if (!cached) {
        logger.warn('[discover-connection] No cached Circles users data found');
        return [];
      }

      return cached.users;
    } catch (error) {
      logger.error(`[discover-connection] Error getting cached Circles users: ${error}`);
      return [];
    }
  }

  /**
   * Count incoming trust connections for a specific user with retry logic
   */
  async getTrustCounts(userAddress: string, maxRetries = 3): Promise<{ incoming: number; outgoing: number }> {
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
      // Get incoming trusts (people who trust this user)
      const incomingResponse = await this.client.request({
        method: 'circles_query' as any,
        params: [
          {
            Namespace: 'V_CrcV2',
            Table: 'TrustRelations',
            Columns: ['truster', 'trustee', 'timestamp'],
            Filter: [
              {
                Type: 'FilterPredicate',
                FilterType: 'Equals',
                Column: 'trustee',
                Value: userAddress,
              },
            ],
            Limit: 1000,
          },
        ],
      });

      const incomingResult = (incomingResponse as any)?.result || incomingResponse;
      const incomingTrusts = incomingResult.rows || [];

      // Filter out self-trusts (users trusting themselves)
      const validIncomingTrusts = incomingTrusts.filter((row: any[]) => {
        const trusterIndex = incomingResult.columns?.indexOf('truster') || 0;
        const trusteeIndex = incomingResult.columns?.indexOf('trustee') || 1;
        return row[trusterIndex] !== row[trusteeIndex]; // Exclude self-trusts
      });

      // Get outgoing trusts (people this user trusts)
      const outgoingResponse = await this.client.request({
        method: 'circles_query' as any,
        params: [
          {
            Namespace: 'V_CrcV2',
            Table: 'TrustRelations',
            Columns: ['truster', 'trustee', 'timestamp'],
            Filter: [
              {
                Type: 'FilterPredicate',
                FilterType: 'Equals',
                Column: 'truster',
                Value: userAddress,
              },
            ],
            Limit: 1000,
          },
        ],
      });

      const outgoingResult = (outgoingResponse as any)?.result || outgoingResponse;
      const outgoingTrusts = outgoingResult.rows || [];

      // Filter out self-trusts for outgoing as well
      const validOutgoingTrusts = outgoingTrusts.filter((row: any[]) => {
        const trusterIndex = outgoingResult.columns?.indexOf('truster') || 0;
        const trusteeIndex = outgoingResult.columns?.indexOf('trustee') || 1;
        return row[trusterIndex] !== row[trusteeIndex]; // Exclude self-trusts
      });

        return {
          incoming: validIncomingTrusts.length,
          outgoing: validOutgoingTrusts.length,
        };
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        
        if (isLastAttempt) {
          logger.error(`[discover-connection] Error getting trust counts for ${userAddress} after ${maxRetries + 1} attempts: ${error}`);
          return { incoming: 0, outgoing: 0 };
        }
        
        // Exponential backoff: 1s, 2s, 4s with jitter
        const baseDelay = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 500; // Add up to 500ms jitter
        const delay = baseDelay + jitter;
        
        logger.warn(`[discover-connection] Retry ${attempt + 1}/${maxRetries} for ${userAddress} after ${Math.round(delay)}ms delay. Error: ${error}`);
        await sleep(delay);
      }
    }
    
    // This should never be reached due to the return in the last attempt catch block
    return { incoming: 0, outgoing: 0 };
  }

  /**
   * Query registered users with trust data using pagination
   */
  async queryRegisteredUsersWithTrustData(
    limit = 1000,
    cursor?: PaginationCursor,
    sortDirection: 'ASC' | 'DESC' = 'DESC'
  ): Promise<{ users: CirclesUser[]; nextCursor?: PaginationCursor }> {
    try {
      const cursorInfo = cursor
        ? `after block ${cursor.blockNumber}:${cursor.transactionIndex}:${cursor.logIndex}`
        : 'from beginning';
      logger.info(
        `[discover-connection] Querying users with trust verification (limit: ${limit}, ${cursorInfo})...`
      );

      // Build filters
      const filters: FilterPredicate[] = [
        {
          Type: 'FilterPredicate',
          FilterType: 'Equals',
          Column: 'type',
          Value: 'CrcV2_RegisterHuman',
        },
      ];

      // Add cursor-based filter if provided
      if (cursor) {
        const comparisonOp = sortDirection === 'ASC' ? 'GreaterThan' : 'LessThan';
        filters.push({
          Type: 'Conjunction',
          ConjunctionType: 'Or',
          Predicates: [
            {
              Type: 'FilterPredicate',
              FilterType: comparisonOp,
              Column: 'blockNumber',
              Value: cursor.blockNumber,
            },
            {
              Type: 'Conjunction',
              ConjunctionType: 'And',
              Predicates: [
                {
                  Type: 'FilterPredicate',
                  FilterType: 'Equals',
                  Column: 'blockNumber',
                  Value: cursor.blockNumber,
                },
                {
                  Type: 'FilterPredicate',
                  FilterType: comparisonOp,
                  Column: 'transactionIndex',
                  Value: cursor.transactionIndex,
                },
              ],
            },
            {
              Type: 'Conjunction',
              ConjunctionType: 'And',
              Predicates: [
                {
                  Type: 'FilterPredicate',
                  FilterType: 'Equals',
                  Column: 'blockNumber',
                  Value: cursor.blockNumber,
                },
                {
                  Type: 'FilterPredicate',
                  FilterType: 'Equals',
                  Column: 'transactionIndex',
                  Value: cursor.transactionIndex,
                },
                {
                  Type: 'FilterPredicate',
                  FilterType: comparisonOp,
                  Column: 'logIndex',
                  Value: cursor.logIndex,
                },
              ],
            },
          ],
        });
      }

      const queryRequest: CirclesQueryRequest = {
        Namespace: 'V_CrcV2',
        Table: 'Avatars',
        Columns: [],
        Filter: filters,
        Order: [
          { Column: 'blockNumber', SortOrder: sortDirection },
          { Column: 'transactionIndex', SortOrder: sortDirection },
          { Column: 'logIndex', SortOrder: sortDirection },
        ],
        Limit: limit,
      };

      // Get registered users
      const response = await this.client.request({
        method: 'circles_query' as any,
        params: [queryRequest],
      });

      const result = (response as any)?.result || response;
      const rows = result.rows || result.Rows || result;
      const columns = result.columns || result.Columns || Object.keys(rows[0] || {});

      if (!rows || rows.length === 0) {
        logger.info('[discover-connection] No registered users found');
        return { users: [], nextCursor: undefined };
      }

      logger.info(
        `[discover-connection] Found ${rows.length} users, checking trust verification...`
      );

      // Process each user and add trust data
      const usersWithTrustData: CirclesUser[] = [];
      const failedUsers: string[] = [];
      const zeroTrustUsers: string[] = [];
      let nextCursor: PaginationCursor | undefined;
      let successfullyProcessed = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        let user: any = {};

        if (Array.isArray(row)) {
          columns.forEach((column: string, index: number) => {
            user[column] = row[index];
          });
        } else {
          user = row;
        }

        try {
          // Get trust counts for this user
          const trustCounts = await this.getTrustCounts(user.avatar);

          // Create user object for ALL successfully fetched users
          const circlesUser: CirclesUser = {
            avatar: user.avatar,
            incomingTrustCount: trustCounts.incoming,
            outgoingTrustCount: trustCounts.outgoing,
            isVerified: trustCounts.incoming >= this.VERIFICATION_THRESHOLD,
            status: trustCounts.incoming >= this.VERIFICATION_THRESHOLD ? 'verified' : 'registered',
            timestamp: user.timestamp || Date.now(),
            blockNumber: user.blockNumber,
            transactionIndex: user.transactionIndex,
            logIndex: user.logIndex,
          };

          usersWithTrustData.push(circlesUser);
          successfullyProcessed++;
          
          // Track zero-trust users for logging purposes
          if (trustCounts.incoming === 0 && trustCounts.outgoing === 0) {
            zeroTrustUsers.push(user.avatar);
          }
        } catch (error) {
          logger.warn(`[discover-connection] Failed to process user ${user.avatar}: ${error}`);
          failedUsers.push(user.avatar);
          // Continue processing other users despite this failure
        }

        // Update next cursor based on the last processed item
        nextCursor = {
          blockNumber: user.blockNumber,
          transactionIndex: user.transactionIndex,
          logIndex: user.logIndex,
        };

        // Progress indicator
        if ((i + 1) % 25 === 0 || i === rows.length - 1) {
          const failedCount = failedUsers.length;
          const zeroTrustCount = zeroTrustUsers.length;
          const withTrustCount = successfullyProcessed - zeroTrustCount;
          logger.info(`[discover-connection] Processed ${i + 1}/${rows.length} users (${withTrustCount} with trusts, ${zeroTrustCount} zero-trust, ${failedCount} failed)`);
        }

        // Increased delay to be respectful to RPC and avoid overload
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Provide detailed summary
      if (failedUsers.length > 0) {
        logger.warn(`[discover-connection] ${failedUsers.length} users failed trust verification lookup in this batch`);
      }
      if (zeroTrustUsers.length > 0) {
        logger.info(`[discover-connection] ${zeroTrustUsers.length} users have zero trust connections (new/inactive users)`);
      }
      
      const verifiedCount = usersWithTrustData.filter(u => u.isVerified).length;
      const unverifiedCount = usersWithTrustData.length - verifiedCount;
      const zeroTrustCount = usersWithTrustData.filter(u => !u.isVerified && u.trustCount === 0).length;
      
      logger.info(`[discover-connection] Batch summary: ${verifiedCount} verified, ${unverifiedCount - zeroTrustCount} unverified (with some trusts), ${zeroTrustCount} zero-trust users, ${failedUsers.length} failures`);
      logger.info(
        `[discover-connection] Found ${verifiedCount} verified and ${unverifiedCount} unverified users out of ${usersWithTrustData.length} total users`
      );

      return {
        users: usersWithTrustData,
        nextCursor: rows.length === limit ? nextCursor : undefined,
      };
    } catch (error) {
      logger.error('[discover-connection] Error querying users with trust data:', error);
      throw error;
    }
  }

  /**
   * Fetch Circles users incrementally (only new users since last update)
   */
  async fetchAndCacheCirclesUsersIncremental(
    batchSize = 1000,
    maxNewUsers = 5000
  ): Promise<{
    success: boolean;
    count: number;
    newUsers: number;
    updatedUsers: number;
    error?: string;
  }> {
    try {
      logger.info('[discover-connection] Starting incremental Circles users update...');

      // Get cursor boundaries for proper incremental updates
      const cursorBoundaries = await this.runtime.getCache<CirclesCursorBoundaries>(
        'circles-users-cursor-boundaries'
      );
      
      // Fallback to legacy cursor for backward compatibility
      const lastCursor = cursorBoundaries
        ? {
            blockNumber: cursorBoundaries.highCursor.blockNumber,
            transactionIndex: cursorBoundaries.highCursor.transactionIndex,
            logIndex: cursorBoundaries.highCursor.logIndex,
            timestamp: cursorBoundaries.timestamp,
            usersCount: cursorBoundaries.usersCount,
          }
        : await this.runtime.getCache<CirclesUsersLastCursor>('circles-users-last-cursor');
      const existingUsers = await this.getCachedCirclesUsers();

      if (!lastCursor && existingUsers.length === 0) {
        logger.info(
          '[discover-connection] No cursor found and no existing data, performing full fetch'
        );
        const fullResult = await this.fetchAndCacheCirclesUsers(batchSize, maxNewUsers);
        return {
          success: fullResult.success,
          count: fullResult.count,
          newUsers: fullResult.count,
          updatedUsers: 0,
          error: fullResult.error,
        };
      }

      const startingCursor: PaginationCursor | undefined = lastCursor
        ? {
            blockNumber: lastCursor.blockNumber,
            transactionIndex: lastCursor.transactionIndex,
            logIndex: lastCursor.logIndex,
          }
        : undefined;

      const cursorDescription = startingCursor 
        ? `${startingCursor.blockNumber}:${startingCursor.transactionIndex}:${startingCursor.logIndex}`
        : 'beginning';
      
      logger.info(
        `[discover-connection] Starting incremental update from cursor: ${cursorDescription} ${cursorBoundaries ? '(using high cursor for new users)' : '(legacy cursor)'}`
      );

      const newUsers: CirclesUser[] = [];
      let cursor = startingCursor;
      let hasMoreData = true;
      let consecutiveEmptyBatches = 0;
      const maxConsecutiveEmpty = 3;

      while (hasMoreData && newUsers.length < maxNewUsers) {
        try {
          const result = await this.queryRegisteredUsersWithTrustData(batchSize, cursor, 'ASC');
          const users = result.users;

          if (users.length === 0) {
            consecutiveEmptyBatches++;
            logger.warn(
              `[discover-connection] Empty batch ${consecutiveEmptyBatches}/${maxConsecutiveEmpty} during incremental update`
            );

            if (consecutiveEmptyBatches >= maxConsecutiveEmpty) {
              logger.info('[discover-connection] No more new data available');
              hasMoreData = false;
            }
          } else {
            consecutiveEmptyBatches = 0;

            // Smart duplicate detection: consider block number for truly new users
            const trulyNewUsers = users.filter((user) => {
              const existingUser = existingUsers.find((existing) => existing.avatar === user.avatar);
              if (!existingUser) {
                return true; // Completely new user
              }
              
              // User exists but check if this is a newer registration 
              // (shouldn't happen in normal flow, but good safety check)
              if (existingUser.blockNumber && user.blockNumber) {
                return user.blockNumber > existingUser.blockNumber;
              }
              
              return false; // User already exists
            });

            newUsers.push(...trulyNewUsers);
            cursor = result.nextCursor;

            logger.info(
              `[discover-connection] Incremental batch: ${users.length} total, ${trulyNewUsers.length} new, ${newUsers.length} cumulative new`
            );

            if (!result.nextCursor) {
              logger.info('[discover-connection] Reached end of available data');
              hasMoreData = false;
            }
          }

          // Increased delay to reduce RPC load during incremental updates
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (error) {
          logger.error(`[discover-connection] Error in incremental batch processing: ${error}`);
          consecutiveEmptyBatches++;
          if (consecutiveEmptyBatches >= maxConsecutiveEmpty) {
            hasMoreData = false;
          }
        }
      }

      // Merge new users with existing users and update trust counts
      const updatedUserCount = await this.mergeAndUpdateUsers(existingUsers, newUsers);

      // Store new cursor position if we have one
      if (cursor) {
        // Get existing boundaries to preserve low cursor
        const existingBoundaries = await this.runtime.getCache<CirclesCursorBoundaries>(
          'circles-users-cursor-boundaries'
        );
        
        const newBoundaries: CirclesCursorBoundaries = {
          highCursor: { // Update high cursor to the latest processed position
            blockNumber: cursor.blockNumber,
            transactionIndex: cursor.transactionIndex,
            logIndex: cursor.logIndex,
          },
          lowCursor: existingBoundaries?.lowCursor || { // Preserve existing low cursor
            blockNumber: cursor.blockNumber,
            transactionIndex: cursor.transactionIndex,
            logIndex: cursor.logIndex,
          },
          timestamp: Date.now(),
          usersCount: existingUsers.length + newUsers.length,
        };
        
        // Store enhanced boundaries
        await this.runtime.setCache('circles-users-cursor-boundaries', newBoundaries);
        
        // Store legacy cursor for backward compatibility
        const newCursor: CirclesUsersLastCursor = {
          blockNumber: cursor.blockNumber,
          transactionIndex: cursor.transactionIndex,
          logIndex: cursor.logIndex,
          timestamp: Date.now(),
          usersCount: existingUsers.length + newUsers.length,
        };
        await this.runtime.setCache('circles-users-last-cursor', newCursor);
        
        logger.info(
          `[discover-connection] Updated cursor boundaries: high=${cursor.blockNumber}:${cursor.transactionIndex}:${cursor.logIndex}`
        );
      }

      const totalUsers = existingUsers.length + newUsers.length;
      const verifiedCount = newUsers.filter((u) => u.isVerified).length;

      logger.info(
        `[discover-connection] Incremental update completed: ${newUsers.length} new users, ${updatedUserCount} updated, ${totalUsers} total (${verifiedCount} new verified)`
      );

      return {
        success: true,
        count: totalUsers,
        newUsers: newUsers.length,
        updatedUsers: updatedUserCount,
      };
    } catch (error) {
      const errorMsg = `Failed to perform incremental Circles users update: ${error}`;
      logger.error(`[discover-connection] ${errorMsg}`);
      return {
        success: false,
        count: 0,
        newUsers: 0,
        updatedUsers: 0,
        error: errorMsg,
      };
    }
  }

  /**
   * Merge new users with existing cached data and update trust counts
   */
  private async mergeAndUpdateUsers(
    existingUsers: CirclesUser[],
    newUsers: CirclesUser[]
  ): Promise<number> {
    try {
      // Create a map of existing users for quick lookup
      const existingUserMap = new Map<string, CirclesUser>();
      existingUsers.forEach((user) => {
        existingUserMap.set(user.avatar.toLowerCase(), user);
      });

      let updatedCount = 0;

      // Update existing users that appear in new data (trust counts may have changed)
      for (const newUser of newUsers) {
        const existingUser = existingUserMap.get(newUser.avatar.toLowerCase());
        if (
          existingUser &&
          (existingUser.incomingTrustCount !== newUser.incomingTrustCount ||
            existingUser.isVerified !== newUser.isVerified)
        ) {
          // Update the existing user's data
          existingUser.incomingTrustCount = newUser.incomingTrustCount;
          existingUser.outgoingTrustCount = newUser.outgoingTrustCount;
          existingUser.isVerified = newUser.isVerified;
          existingUser.status = newUser.status;
          existingUser.timestamp = newUser.timestamp;

          updatedCount++;
          logger.debug(
            `[discover-connection] Updated trust counts for ${newUser.avatar}: ${newUser.incomingTrustCount} trusts, verified: ${newUser.isVerified}`
          );
        }
      }

      // Add truly new users to the existing array
      const trulyNewUsers = newUsers.filter(
        (user) => !existingUserMap.has(user.avatar.toLowerCase())
      );

      const mergedUsers = [...existingUsers, ...trulyNewUsers];

      // Update cache with merged data
      const cacheData: CirclesUsersCache = {
        users: mergedUsers,
        totalCount: mergedUsers.length,
        lastUpdate: Date.now(),
      };

      const lastUpdateData: CirclesUsersLastUpdate = {
        timestamp: Date.now(),
        usersCount: mergedUsers.length,
      };

      await this.runtime.setCache('circles-users-data', cacheData);
      await this.runtime.setCache('circles-users-last-update', lastUpdateData);

      logger.info(
        `[discover-connection] Merged data: ${trulyNewUsers.length} new users, ${updatedCount} updated users, ${mergedUsers.length} total`
      );

      return updatedCount;
    } catch (error) {
      logger.error(`[discover-connection] Error merging user data: ${error}`);
      throw error;
    }
  }

  /**
   * Fetch all Circles users and cache them (full refresh)
   */
  async fetchAndCacheCirclesUsers(
    batchSize = 1000,
    maxUsers = Infinity
  ): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      logger.info('[discover-connection] Starting Circles users fetch and cache operation...');

      const allUsers: CirclesUser[] = [];
      let cursor: PaginationCursor | undefined;
      let firstUserCursor: PaginationCursor | undefined; // Track first user for high cursor
      let hasMoreData = true;
      let consecutiveEmptyBatches = 0;
      const maxConsecutiveEmpty = 3;

      while (hasMoreData && (maxUsers === Infinity || allUsers.length < maxUsers)) {
        try {
          const result = await this.queryRegisteredUsersWithTrustData(batchSize, cursor, 'DESC');
          const users = result.users;

          if (users.length === 0) {
            consecutiveEmptyBatches++;
            logger.warn(
              `[discover-connection] Empty batch ${consecutiveEmptyBatches}/${maxConsecutiveEmpty}`
            );

            if (consecutiveEmptyBatches >= maxConsecutiveEmpty) {
              logger.info(
                '[discover-connection] Multiple empty batches detected, stopping pagination'
              );
              hasMoreData = false;
            }
          } else {
            consecutiveEmptyBatches = 0; // Reset counter on successful batch

            // Add deduplication based on avatar address
            const newUsers = users.filter(
              (user) => !allUsers.some((existing) => existing.avatar === user.avatar)
            );

            allUsers.push(...newUsers);
            
            // Track first user cursor for incremental updates (DESC order means first is highest/newest)
            if (!firstUserCursor && users.length > 0) {
              const firstUser = users[0];
              firstUserCursor = {
                blockNumber: firstUser.blockNumber,
                transactionIndex: firstUser.transactionIndex,
                logIndex: firstUser.logIndex,
              };
            }

            if (newUsers.length !== users.length) {
              const duplicatePercent = (
                ((users.length - newUsers.length) / users.length) *
                100
              ).toFixed(1);
              logger.info(
                `[discover-connection] Progress: ${allUsers.length} users collected (${users.length - newUsers.length} duplicates filtered - ${duplicatePercent}%)`
              );
            } else {
              logger.info(`[discover-connection] Progress: ${allUsers.length} users collected`);
            }

            // Check if we have more data to fetch
            if (!result.nextCursor) {
              logger.info('[discover-connection] No more data available from RPC');
              hasMoreData = false;
            } else {
              cursor = result.nextCursor;
            }
          }

          // Safety check: if we've hit our max user limit, stop
          if (maxUsers !== Infinity && allUsers.length >= maxUsers) {
            logger.info(`[discover-connection] Reached maximum user limit of ${maxUsers}`);
            hasMoreData = false;
          }

          // Increased delay to be respectful to the RPC endpoint and prevent overload
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (error) {
          logger.error(`[discover-connection] Error in batch processing: ${error}`);
          consecutiveEmptyBatches++;
          if (consecutiveEmptyBatches >= maxConsecutiveEmpty) {
            logger.error('[discover-connection] Too many errors, stopping pagination');
            hasMoreData = false;
          }
        }
      }

      // Cache the results
      const cacheData: CirclesUsersCache = {
        users: maxUsers === Infinity ? allUsers : allUsers.slice(0, maxUsers),
        totalCount: allUsers.length,
        lastUpdate: Date.now(),
      };

      const lastUpdateData: CirclesUsersLastUpdate = {
        timestamp: Date.now(),
        usersCount: allUsers.length,
      };

      // Store in cache
      await this.runtime.setCache('circles-users-data', cacheData);
      await this.runtime.setCache('circles-users-last-update', lastUpdateData);

      // Store cursor boundaries for incremental updates
      if (firstUserCursor && cursor) {
        // Store enhanced cursor boundaries
        const cursorBoundaries: CirclesCursorBoundaries = {
          highCursor: firstUserCursor, // Newest user (for incremental start)
          lowCursor: cursor, // Oldest user (for completeness tracking)
          timestamp: Date.now(),
          usersCount: allUsers.length,
        };
        await this.runtime.setCache('circles-users-cursor-boundaries', cursorBoundaries);
        
        // Also store legacy cursor for backward compatibility
        const cursorData: CirclesUsersLastCursor = {
          blockNumber: firstUserCursor.blockNumber, // Use high cursor as main cursor
          transactionIndex: firstUserCursor.transactionIndex,
          logIndex: firstUserCursor.logIndex,
          timestamp: Date.now(),
          usersCount: allUsers.length,
        };
        await this.runtime.setCache('circles-users-last-cursor', cursorData);
        
        logger.info(
          `[discover-connection] Stored cursor boundaries: high=${firstUserCursor.blockNumber}:${firstUserCursor.transactionIndex}:${firstUserCursor.logIndex}, low=${cursor.blockNumber}:${cursor.transactionIndex}:${cursor.logIndex}`
        );
      }

      const verifiedCount = allUsers.filter((u) => u.isVerified).length;
      logger.info(
        `[discover-connection] Successfully cached ${allUsers.length} Circles users (${verifiedCount} verified, ${allUsers.length - verifiedCount} registered)`
      );

      return { success: true, count: allUsers.length };
    } catch (error) {
      const errorMsg = `Failed to fetch and cache Circles users: ${error}`;
      logger.error(`[discover-connection] ${errorMsg}`);
      return { success: false, count: 0, error: errorMsg };
    }
  }

  /**
   * Check the status of a wallet address in the Circles network
   */
  async checkUserStatus(walletAddress: string): Promise<UserStatusCheck> {
    try {
      const users = await this.getCachedCirclesUsers();

      const user = users.find((u) => u.avatar.toLowerCase() === walletAddress.toLowerCase());

      if (!user) {
        return {
          found: false,
          verified: false,
          registered: false,
          trustCount: 0,
        };
      }

      const needsTrusts = user.isVerified
        ? 0
        : Math.max(0, this.VERIFICATION_THRESHOLD - user.incomingTrustCount);

      return {
        found: true,
        verified: user.isVerified,
        registered: true,
        trustCount: user.incomingTrustCount,
        needsTrusts: needsTrusts,
      };
    } catch (error) {
      logger.error(
        `[discover-connection] Error checking user status for ${walletAddress}: ${error}`
      );
      return {
        found: false,
        verified: false,
        registered: false,
        trustCount: 0,
      };
    }
  }

  /**
   * Refresh Circles users cache with choice of full or incremental update
   */
  async refreshCirclesUsersCache(
    mode: 'full' | 'incremental' | 'auto' = 'auto',
    batchSize = 1000,
    maxUsers = 10000
  ): Promise<{
    success: boolean;
    count: number;
    mode: 'full' | 'incremental';
    newUsers?: number;
    updatedUsers?: number;
    error?: string;
  }> {
    try {
      logger.info(`[discover-connection] Manual refresh requested (mode: ${mode})`);

      if (mode === 'auto') {
        // Decide automatically based on whether we have cursor and existing data
        const lastCursor = await this.runtime.getCache<CirclesUsersLastCursor>(
          'circles-users-last-cursor'
        );
        const existingUsers = await this.getCachedCirclesUsers();

        mode = lastCursor && existingUsers.length > 0 ? 'incremental' : 'full';
        logger.info(`[discover-connection] Auto mode selected: ${mode}`);
      }

      if (mode === 'incremental') {
        const result = await this.fetchAndCacheCirclesUsersIncremental(batchSize, maxUsers);
        return {
          success: result.success,
          count: result.count,
          mode: 'incremental',
          newUsers: result.newUsers,
          updatedUsers: result.updatedUsers,
          error: result.error,
        };
      } else {
        const result = await this.fetchAndCacheCirclesUsers(batchSize, maxUsers);
        return {
          success: result.success,
          count: result.count,
          mode: 'full',
          error: result.error,
        };
      }
    } catch (error) {
      const errorMsg = `Failed to refresh Circles users cache: ${error}`;
      logger.error(`[discover-connection] ${errorMsg}`);
      return {
        success: false,
        count: 0,
        mode: mode === 'auto' ? ('unknown' as any) : mode,
        error: errorMsg,
      };
    }
  }

  /**
   * Clear cursor to force next update to be a full refresh
   */
  async clearUpdateCursor(): Promise<void> {
    try {
      await this.runtime.deleteCache('circles-users-last-cursor');
      logger.info('[discover-connection] Cleared update cursor - next update will be full refresh');
    } catch (error) {
      logger.error(`[discover-connection] Error clearing update cursor: ${error}`);
    }
  }

  /**
   * Clear all cached data to force a complete refresh
   */
  async clearAllCache(): Promise<void> {
    try {
      // Clear user data cache
      await this.runtime.deleteCache('circles-users-data');
      
      // Clear update tracking
      await this.runtime.deleteCache('circles-users-last-update');
      
      // Clear legacy cursor
      await this.runtime.deleteCache('circles-users-last-cursor');
      
      // Clear enhanced cursor boundaries
      await this.runtime.deleteCache('circles-users-cursor-boundaries');
      
      logger.info('[discover-connection] Cleared all Circles users cache - next update will be a complete refresh with proper cursor tracking');
    } catch (error) {
      logger.error(`[discover-connection] Error clearing all cache: ${error}`);
      throw error;
    }
  }

  /**
   * Get summary statistics of cached data
   */
  async getCacheStatistics(): Promise<{
    totalUsers: number;
    verifiedUsers: number;
    registeredUsers: number;
    lastUpdate: Date | null;
    cacheAge: string;
    lastCursor?: {
      position: string;
      timestamp: Date;
    };
  }> {
    try {
      const users = await this.getCachedCirclesUsers();
      const lastUpdate = await this.runtime.getCache<CirclesUsersLastUpdate>(
        'circles-users-last-update'
      );
      const cursorBoundaries = await this.runtime.getCache<CirclesCursorBoundaries>(
        'circles-users-cursor-boundaries'
      );
      const lastCursor = await this.runtime.getCache<CirclesUsersLastCursor>(
        'circles-users-last-cursor'
      );

      const verifiedUsers = users.filter((u) => u.isVerified).length;
      const lastUpdateDate = lastUpdate ? new Date(lastUpdate.timestamp) : null;
      const cacheAge = lastUpdate
        ? `${Math.round((Date.now() - lastUpdate.timestamp) / (1000 * 60 * 60))} hours`
        : 'unknown';

      return {
        totalUsers: users.length,
        verifiedUsers,
        registeredUsers: users.length - verifiedUsers,
        lastUpdate: lastUpdateDate,
        cacheAge,
        ...((cursorBoundaries || lastCursor) && {
          lastCursor: {
            position: cursorBoundaries 
              ? `${cursorBoundaries.highCursor.blockNumber}:${cursorBoundaries.highCursor.transactionIndex}:${cursorBoundaries.highCursor.logIndex}` 
              : `${lastCursor!.blockNumber}:${lastCursor!.transactionIndex}:${lastCursor!.logIndex}`,
            timestamp: new Date((cursorBoundaries || lastCursor)!.timestamp),
            boundaries: cursorBoundaries ? {
              high: `${cursorBoundaries.highCursor.blockNumber}:${cursorBoundaries.highCursor.transactionIndex}:${cursorBoundaries.highCursor.logIndex}`,
              low: `${cursorBoundaries.lowCursor.blockNumber}:${cursorBoundaries.lowCursor.transactionIndex}:${cursorBoundaries.lowCursor.logIndex}`,
            } : undefined,
          },
        }),
      };
    } catch (error) {
      logger.error(`[discover-connection] Error getting cache statistics: ${error}`);
      return {
        totalUsers: 0,
        verifiedUsers: 0,
        registeredUsers: 0,
        lastUpdate: null,
        cacheAge: 'unknown',
      };
    }
  }
}

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
   * Count incoming trust connections for a specific user
   */
  async getTrustCounts(userAddress: string): Promise<{ incoming: number; outgoing: number }> {
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
      logger.error(`[discover-connection] Error getting trust counts for ${userAddress}: ${error}`);
      return { incoming: 0, outgoing: 0 };
    }
  }

  /**
   * Query registered users with trust data using pagination
   */
  async queryRegisteredUsersWithTrustData(
    limit = 1000,
    cursor?: PaginationCursor
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
        filters.push({
          Type: 'Conjunction',
          ConjunctionType: 'Or',
          Predicates: [
            {
              Type: 'FilterPredicate',
              FilterType: 'LessThan',
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
                  FilterType: 'LessThan',
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
                  FilterType: 'LessThan',
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
          { Column: 'blockNumber', SortOrder: 'DESC' },
          { Column: 'transactionIndex', SortOrder: 'DESC' },
          { Column: 'logIndex', SortOrder: 'DESC' },
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
      let nextCursor: PaginationCursor | undefined;

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

        // Get trust counts for this user
        const trustCounts = await this.getTrustCounts(user.avatar);

        // Create simplified user object for cache
        const circlesUser: CirclesUser = {
          avatar: user.avatar,
          incomingTrustCount: trustCounts.incoming,
          outgoingTrustCount: trustCounts.outgoing,
          isVerified: trustCounts.incoming >= this.VERIFICATION_THRESHOLD,
          status: trustCounts.incoming >= this.VERIFICATION_THRESHOLD ? 'verified' : 'registered',
          timestamp: user.timestamp || Date.now(),
        };

        usersWithTrustData.push(circlesUser);

        // Update next cursor based on the last processed item
        nextCursor = {
          blockNumber: user.blockNumber,
          transactionIndex: user.transactionIndex,
          logIndex: user.logIndex,
        };

        // Progress indicator
        if ((i + 1) % 25 === 0 || i === rows.length - 1) {
          logger.info(`[discover-connection] Processed ${i + 1}/${rows.length} users`);
        }

        // Small delay to be respectful to RPC
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      const verifiedCount = usersWithTrustData.filter((u) => u.isVerified).length;
      logger.info(
        `[discover-connection] Found ${verifiedCount} verified users out of ${usersWithTrustData.length} total users`
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

      // Get last cursor position
      const lastCursor = await this.runtime.getCache<CirclesUsersLastCursor>(
        'circles-users-last-cursor'
      );
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

      logger.info(
        `[discover-connection] Starting from cursor: ${startingCursor ? `${startingCursor.blockNumber}:${startingCursor.transactionIndex}:${startingCursor.logIndex}` : 'beginning'}`
      );

      const newUsers: CirclesUser[] = [];
      let cursor = startingCursor;
      let hasMoreData = true;
      let consecutiveEmptyBatches = 0;
      const maxConsecutiveEmpty = 3;

      while (hasMoreData && newUsers.length < maxNewUsers) {
        try {
          const result = await this.queryRegisteredUsersWithTrustData(batchSize, cursor);
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

            // Filter for truly new users (not in existing cache)
            const trulyNewUsers = users.filter(
              (user) => !existingUsers.some((existing) => existing.avatar === user.avatar)
            );

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

          // Small delay
          await new Promise((resolve) => setTimeout(resolve, 100));
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
        const newCursor: CirclesUsersLastCursor = {
          blockNumber: cursor.blockNumber,
          transactionIndex: cursor.transactionIndex,
          logIndex: cursor.logIndex,
          timestamp: Date.now(),
          usersCount: existingUsers.length + newUsers.length,
        };

        await this.runtime.setCache('circles-users-last-cursor', newCursor);
        logger.info(
          `[discover-connection] Stored new cursor: ${cursor.blockNumber}:${cursor.transactionIndex}:${cursor.logIndex}`
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
      let hasMoreData = true;
      let consecutiveEmptyBatches = 0;
      const maxConsecutiveEmpty = 3;

      while (hasMoreData && (maxUsers === Infinity || allUsers.length < maxUsers)) {
        try {
          const result = await this.queryRegisteredUsersWithTrustData(batchSize, cursor);
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

          // Small delay to be respectful to the RPC endpoint
          await new Promise((resolve) => setTimeout(resolve, 100));
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

      // Store cursor position for incremental updates
      if (cursor) {
        const cursorData: CirclesUsersLastCursor = {
          blockNumber: cursor.blockNumber,
          transactionIndex: cursor.transactionIndex,
          logIndex: cursor.logIndex,
          timestamp: Date.now(),
          usersCount: allUsers.length,
        };
        await this.runtime.setCache('circles-users-last-cursor', cursorData);
        logger.info(
          `[discover-connection] Stored cursor for incremental updates: ${cursor.blockNumber}:${cursor.transactionIndex}:${cursor.logIndex}`
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
        ...(lastCursor && {
          lastCursor: {
            position: `${lastCursor.blockNumber}:${lastCursor.transactionIndex}:${lastCursor.logIndex}`,
            timestamp: new Date(lastCursor.timestamp),
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

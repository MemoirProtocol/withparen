#!/usr/bin/env bun

/**
 * Circles RPC Verified Users Query Script
 * 
 * This script queries the Circles RPC endpoint to fetch verified human users
 * from the Circles network, similar to the Dune Analytics query but using
 * the native Circles Nethermind RPC endpoint.
 * 
 * Usage:
 *   bun scripts/query-circles-verified-users.ts
 *   bun scripts/query-circles-verified-users.ts --limit 100
 *   bun scripts/query-circles-verified-users.ts --output verified-users.json
 */

import { createPublicClient, http } from 'viem';
import { writeFile } from 'fs/promises';
import { join } from 'path';

// Types for Circles RPC requests and responses
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

interface VerifiedUser {
  avatar: string;
  blockNumber: number;
  timestamp: number;
  transactionHash: string;
  human_register_time?: number;
  name?: string;
  invitedBy?: string;
  incomingTrustCount: number;
  outgoingTrustCount: number;
  isVerified: boolean;
  status: 'verified' | 'unverified';
  trustVerificationTime?: number;
}

interface CirclesRPCResponse {
  result: {
    Rows: any[][];
    Columns: string[];
  };
}

class CirclesVerifiedUsersQuery {
  private client;
  private readonly rpcUrl = 'https://rpc.circlesubi.network/';

  constructor() {
    this.client = createPublicClient({
      transport: http(this.rpcUrl),
    });
  }

  /**
   * Try alternative query methods to find available data
   */
  async exploreAvailableData(): Promise<void> {
    console.log('🔍 Exploring available data structures...\n');

    // Try querying different tables without filters
    const tablesToTry = [
      { namespace: 'V_CrcV2', table: 'Avatars' },
      { namespace: 'V_Crc', table: 'Avatars' },
      { namespace: 'V_CrcV2', table: 'RegisterHuman' },
      { namespace: 'V_Crc', table: 'RegisterHuman' }
    ];

    for (const { namespace, table } of tablesToTry) {
      try {
        console.log(`📋 Trying ${namespace}.${table}...`);

        const queryRequest: CirclesQueryRequest = {
          Namespace: namespace,
          Table: table,
          Columns: [],
          Limit: 5
        };

        const response = await this.client.request({
          method: 'circles_query' as any,
          params: [queryRequest],
        });

        const result = (response as any)?.result || response;
        const rows = result.rows || result.Rows || [];

        console.log(`   📊 Found ${rows.length} records`);

        if (rows.length > 0) {
          console.log('   📝 Sample record:', JSON.stringify(rows[0], null, 2));
          console.log('   🏷️ Available columns:', result.columns || result.Columns);
        }

        console.log('');

      } catch (error) {
        console.log(`   ❌ Error: ${error}\n`);
      }
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
        params: [{
          Namespace: 'V_CrcV2',
          Table: 'TrustRelations',
          Columns: ['truster', 'trustee', 'timestamp'],
          Filter: [{
            Type: 'FilterPredicate',
            FilterType: 'Equals',
            Column: 'trustee',
            Value: userAddress
          }],
          Limit: 1000 // Should be enough for trust connections
        }],
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
        params: [{
          Namespace: 'V_CrcV2',
          Table: 'TrustRelations',
          Columns: ['truster', 'trustee', 'timestamp'],
          Filter: [{
            Type: 'FilterPredicate',
            FilterType: 'Equals',
            Column: 'truster',
            Value: userAddress
          }],
          Limit: 1000
        }],
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
        outgoing: validOutgoingTrusts.length
      };

    } catch (error) {
      console.error(`❌ Error getting trust counts for ${userAddress}:`, error);
      return { incoming: 0, outgoing: 0 };
    }
  }

  /**
   * Check if user is verified (has 3+ incoming trust connections)
   */
  async isUserVerified(userAddress: string): Promise<boolean> {
    const { incoming } = await this.getTrustCounts(userAddress);
    return incoming >= 3;
  }

  /**
   * Query all users and add trust verification data
   */
  async queryRegisteredUsersWithTrustData(limit = 1000, cursor?: PaginationCursor): Promise<{ users: VerifiedUser[], nextCursor?: PaginationCursor }> {
    try {
      const cursorInfo = cursor ? `after block ${cursor.blockNumber}:${cursor.transactionIndex}:${cursor.logIndex}` : 'from beginning';
      console.log(`🔍 Querying users with trust verification (limit: ${limit}, ${cursorInfo})...`);

      // Build filters
      const filters: FilterPredicate[] = [
        {
          Type: 'FilterPredicate',
          FilterType: 'Equals',
          Column: 'type',
          Value: 'CrcV2_RegisterHuman'
        }
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
              Value: cursor.blockNumber
            },
            {
              Type: 'Conjunction',
              ConjunctionType: 'And',
              Predicates: [
                {
                  Type: 'FilterPredicate',
                  FilterType: 'Equals',
                  Column: 'blockNumber',
                  Value: cursor.blockNumber
                },
                {
                  Type: 'FilterPredicate',
                  FilterType: 'LessThan',
                  Column: 'transactionIndex',
                  Value: cursor.transactionIndex
                }
              ]
            },
            {
              Type: 'Conjunction',
              ConjunctionType: 'And',
              Predicates: [
                {
                  Type: 'FilterPredicate',
                  FilterType: 'Equals',
                  Column: 'blockNumber',
                  Value: cursor.blockNumber
                },
                {
                  Type: 'FilterPredicate',
                  FilterType: 'Equals',
                  Column: 'transactionIndex',
                  Value: cursor.transactionIndex
                },
                {
                  Type: 'FilterPredicate',
                  FilterType: 'LessThan',
                  Column: 'logIndex',
                  Value: cursor.logIndex
                }
              ]
            }
          ]
        });
      }

      const queryRequest: CirclesQueryRequest = {
        Namespace: 'V_CrcV2',
        Table: 'Avatars',
        Columns: [], // Request all columns to see what's available
        Filter: filters,
        Order: [
          {
            Column: 'blockNumber',
            SortOrder: 'DESC'
          },
          {
            Column: 'transactionIndex',
            SortOrder: 'DESC'
          },
          {
            Column: 'logIndex',
            SortOrder: 'DESC'
          }
        ],
        Limit: limit
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
        console.log('⚠️ No registered users found');
        return { users: [], nextCursor: undefined };
      }

      console.log(`📋 Found ${rows.length} users, checking trust verification...`);

      // Process each user and add trust data
      const usersWithTrustData: VerifiedUser[] = [];
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

        // Create verified user object
        const verifiedUser: VerifiedUser = {
          avatar: user.avatar,
          blockNumber: user.blockNumber,
          timestamp: user.timestamp,
          transactionHash: user.transactionHash,
          human_register_time: user.timestamp,
          name: user.name || null,
          invitedBy: user.invitedBy || null,
          incomingTrustCount: trustCounts.incoming,
          outgoingTrustCount: trustCounts.outgoing,
          isVerified: trustCounts.incoming >= 3,
          status: trustCounts.incoming >= 3 ? 'verified' : 'unverified',
          trustVerificationTime: user.timestamp // For now, use registration time
        };

        usersWithTrustData.push(verifiedUser);

        // Update next cursor based on the last processed item
        nextCursor = {
          blockNumber: user.blockNumber,
          transactionIndex: user.transactionIndex,
          logIndex: user.logIndex
        };

        // Progress indicator
        if ((i + 1) % 25 === 0 || i === rows.length - 1) {
          console.log(`📊 Processed ${i + 1}/${rows.length} users`);
        }

        // Small delay to be respectful to RPC
        await new Promise(resolve => setTimeout(resolve, 20));
      }

      const verifiedCount = usersWithTrustData.filter(u => u.isVerified).length;
      console.log(`✅ Found ${verifiedCount} verified users out of ${usersWithTrustData.length} total users`);

      return {
        users: usersWithTrustData,
        nextCursor: rows.length === limit ? nextCursor : undefined // Only return cursor if we got a full batch
      };

    } catch (error) {
      console.error('❌ Error querying users with trust data:', error);
      throw error;
    }
  }

  /**
   * Query verified users from Circles RPC
   */
  async queryVerifiedUsers(limit = 1000, cursor?: PaginationCursor, verifiedOnly = false): Promise<{ users: VerifiedUser[], nextCursor?: PaginationCursor }> {
    // Use the new trust verification method
    const result = await this.queryRegisteredUsersWithTrustData(limit, cursor);

    if (verifiedOnly) {
      // Filter to only return verified users (3+ trust connections)
      const verifiedUsers = result.users.filter(user => user.isVerified);
      console.log(`🔍 Filtered to ${verifiedUsers.length} verified users from ${result.users.length} total users`);
      return { users: verifiedUsers, nextCursor: result.nextCursor };
    }

    return result;
  }

  /**
   * Query all verified users with pagination
   */
  async queryAllVerifiedUsers(batchSize = 1000, maxUsers = Infinity, verifiedOnly = false): Promise<VerifiedUser[]> {
    const allUsers: VerifiedUser[] = [];
    let cursor: PaginationCursor | undefined;
    let hasMoreData = true;
    let consecutiveEmptyBatches = 0;
    const maxConsecutiveEmpty = 3;

    const maxUsersText = maxUsers === Infinity ? 'unlimited' : maxUsers.toString();
    console.log(`📊 Starting cursor-based paginated query (batch size: ${batchSize}, max users: ${maxUsersText})`);

    while (hasMoreData && (maxUsers === Infinity || allUsers.length < maxUsers)) {
      try {
        const result = await this.queryVerifiedUsers(batchSize, cursor, verifiedOnly);
        const users = result.users;

        if (users.length === 0) {
          consecutiveEmptyBatches++;
          const cursorInfo = cursor ? `block ${cursor.blockNumber}:${cursor.transactionIndex}:${cursor.logIndex}` : 'beginning';
          console.log(`⚠️  Empty batch ${consecutiveEmptyBatches}/${maxConsecutiveEmpty} at ${cursorInfo}`);

          if (consecutiveEmptyBatches >= maxConsecutiveEmpty) {
            console.log('🛑 Multiple empty batches detected, stopping pagination');
            hasMoreData = false;
          }
        } else {
          consecutiveEmptyBatches = 0; // Reset counter on successful batch

          // Add deduplication based on avatar address
          const newUsers = users.filter(user =>
            !allUsers.some(existing => existing.avatar === user.avatar)
          );

          allUsers.push(...newUsers);

          if (newUsers.length !== users.length) {
            const duplicatePercent = ((users.length - newUsers.length) / users.length * 100).toFixed(1);
            console.log(`📈 Progress: ${allUsers.length} users collected (${users.length - newUsers.length} duplicates filtered - ${duplicatePercent}%)`);
          } else {
            console.log(`📈 Progress: ${allUsers.length} users collected`);
          }

          // Check if we have more data to fetch
          if (!result.nextCursor) {
            console.log('📋 No more data available from RPC');
            hasMoreData = false;
          } else {
            cursor = result.nextCursor;
          }
        }

        // Safety check: if we've hit our max user limit, stop
        if (maxUsers !== Infinity && allUsers.length >= maxUsers) {
          console.log(`🎯 Reached maximum user limit of ${maxUsers}`);
          hasMoreData = false;
        }

        // Small delay to be respectful to the RPC endpoint
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        const cursorInfo = cursor ? `block ${cursor.blockNumber}:${cursor.transactionIndex}:${cursor.logIndex}` : 'beginning';
        console.error(`❌ Error at ${cursorInfo}:`, error);
        // Continue to next batch on error, but increment empty batch counter
        consecutiveEmptyBatches++;
        if (consecutiveEmptyBatches >= maxConsecutiveEmpty) {
          console.log('🛑 Too many errors, stopping pagination');
          hasMoreData = false;
        }
      }
    }

    console.log(`✅ Pagination complete. Total users collected: ${allUsers.length}`);
    return maxUsers === Infinity ? allUsers : allUsers.slice(0, maxUsers); // Ensure we don't exceed max users
  }

  /**
   * Get summary statistics
   */
  getSummaryStats(users: VerifiedUser[]) {
    const totalRegisteredUsers = users.length; // All users are registered
    const verifiedUsers = users.filter(u => u.isVerified);
    const unverifiedUsers = users.filter(u => !u.isVerified);

    const oldestRegistration = users.length > 0 ?
      Math.min(...users.map(u => u.timestamp)) : 0;
    const newestRegistration = users.length > 0 ?
      Math.max(...users.map(u => u.timestamp)) : 0;

    // Trust statistics
    const trustCounts = users.map(u => u.incomingTrustCount);
    const avgTrustCount = trustCounts.length > 0 ?
      (trustCounts.reduce((a, b) => a + b, 0) / trustCounts.length).toFixed(2) : '0';
    const maxTrustCount = trustCounts.length > 0 ? Math.max(...trustCounts) : 0;

    return {
      totalRegisteredUsers,
      verifiedUsers: verifiedUsers.length,
      unverifiedUsers: unverifiedUsers.length,
      verificationRate: totalRegisteredUsers > 0 ? ((verifiedUsers.length / totalRegisteredUsers) * 100).toFixed(1) + '%' : '0%',
      oldestRegistration: new Date(oldestRegistration * 1000).toISOString(),
      newestRegistration: new Date(newestRegistration * 1000).toISOString(),
      uniqueAddresses: new Set(users.map(u => u.avatar)).size,
      avgIncomingTrusts: parseFloat(avgTrustCount),
      maxIncomingTrusts: maxTrustCount
    };
  }

  /**
   * Export users to JSON file
   */
  async exportToJson(users: VerifiedUser[], filename: string) {
    const data = {
      metadata: {
        exportDate: new Date().toISOString(),
        totalUsers: users.length,
        source: 'circles-rpc-nethermind',
        endpoint: this.rpcUrl
      },
      summary: this.getSummaryStats(users),
      users: users
    };

    await writeFile(filename, JSON.stringify(data, null, 2));
    console.log(`📁 Exported ${users.length} users to ${filename}`);
  }
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse command line arguments
  let limit = 100;
  let outputFile = '';
  let queryAll = false;
  let exploreData = false;
  let maxUsers = Infinity;
  let includeRegistered = true;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--limit':
        limit = parseInt(args[i + 1]) || 1000;
        i++;
        break;
      case '--output':
        outputFile = args[i + 1] || '';
        i++;
        break;
      case '--all':
        queryAll = true;
        break;
      case '--explore':
        exploreData = true;
        break;
      case '--max-users':
        maxUsers = parseInt(args[i + 1]) || Infinity;
        i++;
        break;
      case '--verified-only':
        includeRegistered = false;
        break;
      case '--help':
        console.log(`
🔵 Circles RPC Verified Users Query

Usage:
  bun scripts/query-circles-verified-users.ts [options]

Options:
  --limit <number>      Limit number of users to fetch (default: 100)
  --output <file>       Export results to JSON file
  --all                 Query all users with pagination until completion
  --max-users <number>  Maximum users when using --all (optional limit)
  --verified-only       Only include verified users (default: include all registered users)
  --explore             Explore available data structures and tables
  --help                Show this help message

Examples:
  bun scripts/query-circles-verified-users.ts --limit 20
  bun scripts/query-circles-verified-users.ts --all --output verified-users.json
  bun scripts/query-circles-verified-users.ts --all --max-users 100 --output all-users.json
  bun scripts/query-circles-verified-users.ts --all --verified-only --output verified-only.json
  bun scripts/query-circles-verified-users.ts --limit 10 --output sample-verified.json
  bun scripts/query-circles-verified-users.ts --explore
        `);
        process.exit(0);
    }
  }

  try {
    const query = new CirclesVerifiedUsersQuery();

    console.log('🔵 Starting Circles verified users query...\n');

    // If explore mode is enabled, just explore and exit
    if (exploreData) {
      await query.exploreAvailableData();
      return;
    }

    let users: VerifiedUser[];
    const verifiedOnly = !includeRegistered;

    if (queryAll) {
      users = await query.queryAllVerifiedUsers(1000, maxUsers, verifiedOnly);
    } else {
      const result = await query.queryVerifiedUsers(limit, undefined, verifiedOnly);
      users = result.users;
    }

    // Display summary
    const stats = query.getSummaryStats(users);
    console.log('\n📊 Summary Statistics:');
    console.log(`- Total registered users: ${stats.totalRegisteredUsers}`);
    console.log(`- Verified users (3+ trusts): ${stats.verifiedUsers}`);
    console.log(`- Unverified users (0-2 trusts): ${stats.unverifiedUsers}`);
    console.log(`- Verification rate: ${stats.verificationRate}`);
    console.log(`- Average incoming trusts: ${stats.avgIncomingTrusts}`);
    console.log(`- Max incoming trusts: ${stats.maxIncomingTrusts}`);
    console.log(`- Unique addresses: ${stats.uniqueAddresses}`);
    console.log(`- Oldest registration: ${stats.oldestRegistration}`);
    console.log(`- Newest registration: ${stats.newestRegistration}`);

    // Display sample users
    if (users.length > 0) {
      console.log(`\n📝 Sample users (first 5):`);
      users.slice(0, 5).forEach((user, index) => {
        const date = new Date(user.timestamp * 1000).toISOString().split('T')[0];
        const statusIcon = user.status === 'verified' ? '✅' : '📝';
        const statusText = user.status === 'verified' ? 'VERIFIED' : 'UNVERIFIED';
        const trustInfo = `(${user.incomingTrustCount}←/${user.outgoingTrustCount}→ trusts)`;
        const nameInfo = user.name ? ` [${user.name}]` : '';
        console.log(`  ${index + 1}. ${user.avatar}${nameInfo} ${statusIcon} ${statusText} ${trustInfo} (reg: ${date})`);
      });
    }

    // Export to file if specified
    if (outputFile) {
      const filename = outputFile.endsWith('.json') ? outputFile : `${outputFile}.json`;
      const fullPath = join(process.cwd(), filename);
      await query.exportToJson(users, fullPath);
    }

    console.log('\n✅ Query completed successfully!');

  } catch (error) {
    console.error('\n❌ Error during execution:', error);
    process.exit(1);
  }
}

// Execute main function if script is run directly
if (import.meta.main) {
  main().catch(console.error);
}

export { CirclesVerifiedUsersQuery };
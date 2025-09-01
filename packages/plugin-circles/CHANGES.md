# Plugin Circles Changes

## Overview
This plugin was created by copying `plugin-evm` and removing governance-related actions for Circles protocol focus.

## Changes Made

### Actions Removed
- **bridge.ts** - Cross-chain bridging functionality
- **gov-execute.ts** - Governance proposal execution
- **gov-propose.ts** - Governance proposal creation
- **gov-queue.ts** - Governance proposal queuing
- **gov-vote.ts** - Governance voting

### Actions Kept
- **swap.ts** - Token swapping functionality
- **transfer.ts** - Token transfer functionality
- **trust.ts** - Trust operations (important for Circles protocol)

### Plugin Configuration
- **Name**: `circles`
- **Description**: Circles blockchain integration plugin
- **Focused on**: Core EVM operations without governance complexity

## Usage
This plugin provides streamlined EVM functionality specifically tailored for Circles protocol applications, removing governance complexity while maintaining essential token operations and trust functionality.
import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import { onboardingProvider } from '../providers/onboarding';
import { MemgraphService } from '../services/memgraph';
import { createMockRuntime, createMockMemory, createMockState } from './test-utils';
import { logger } from '@elizaos/core';

describe('Onboarding Provider', () => {
  let mockRuntime: any;
  let mockMemgraphService: any;

  beforeEach(() => {
    // Spy on logger methods to suppress output during tests
    spyOn(logger, 'error').mockImplementation(() => {});
    spyOn(logger, 'warn').mockImplementation(() => {});
    spyOn(logger, 'debug').mockImplementation(() => {});
    spyOn(logger, 'info').mockImplementation(() => {});

    mockRuntime = createMockRuntime();

    // Mock MemgraphService methods
    mockMemgraphService = {
      connect: mock(() => Promise.resolve()),
      disconnect: mock(() => Promise.resolve()),
      findPersonByWebId: mock(() => Promise.resolve(null)),
    };

    // Mock the constructor to return our mock instance
    spyOn(MemgraphService.prototype, 'connect').mockImplementation(mockMemgraphService.connect);
    spyOn(MemgraphService.prototype, 'disconnect').mockImplementation(
      mockMemgraphService.disconnect
    );
    spyOn(MemgraphService.prototype, 'findPersonByWebId').mockImplementation(
      mockMemgraphService.findPersonByWebId
    );
  });

  it('should always return connection invite creation context (authentication skipped)', async () => {
    const message = createMockMemory({
      entityId: 'user123',
    });
    const state = createMockState();

    const result = await onboardingProvider.get(mockRuntime, message, state);

    // Authentication is skipped, so no database calls should be made
    expect(mockMemgraphService.connect).not.toHaveBeenCalled();
    expect(mockMemgraphService.findPersonByWebId).not.toHaveBeenCalled();
    expect(mockMemgraphService.disconnect).not.toHaveBeenCalled();

    expect(result.values?.onboardingStage).toBe('connection_invite_creation');
    expect(result.text).toContain('Important task: App Onboarding to create connection invites');
    expect(result.text).toContain('Step-by-Step Conversation Flow');
  });

  it('should skip authentication check regardless of Person node existence', async () => {
    const message = createMockMemory({
      entityId: 'user123',
    });
    const state = createMockState();

    // Even if we set up mocks, they shouldn't be called
    mockMemgraphService.findPersonByWebId.mockImplementation(() => Promise.resolve(null));

    const result = await onboardingProvider.get(mockRuntime, message, state);

    expect(result.values?.onboardingStage).toBe('connection_invite_creation');
    expect(result.text).toContain('Important task: App Onboarding to create connection invites');

    // Verify no database calls were made
    expect(mockMemgraphService.connect).not.toHaveBeenCalled();
    expect(mockMemgraphService.findPersonByWebId).not.toHaveBeenCalled();
  });

  it('should skip authentication check regardless of email status', async () => {
    const message = createMockMemory({
      entityId: 'user123',
    });
    const state = createMockState();

    const result = await onboardingProvider.get(mockRuntime, message, state);

    expect(result.values?.onboardingStage).toBe('connection_invite_creation');
    expect(result.text).toContain('Important task: App Onboarding to create connection invites');

    // Verify no database calls were made
    expect(mockMemgraphService.connect).not.toHaveBeenCalled();
  });

  it('should always proceed to connection creation flow', async () => {
    const message = createMockMemory({
      entityId: 'user123',
    });
    const state = createMockState();

    const result = await onboardingProvider.get(mockRuntime, message, state);

    expect(result.values?.onboardingStage).toBe('connection_invite_creation');
    expect(result.text).toContain('Important task: App Onboarding to create connection invites');
    expect(result.text).toContain('Step-by-Step Conversation Flow');
    expect(result.text).toContain('Acknowledge their relationship goal');
  });

  // TODO: Re-enable these tests if authentication is restored in the future
  // it('should handle database errors gracefully and return default context', async () => {
  //   const message = createMockMemory({ entityId: 'user123' });
  //   const state = createMockState();
  //   mockMemgraphService.findPersonByWebId.mockImplementation(() => Promise.reject(new Error('Database connection failed')));
  //   const result = await onboardingProvider.get(mockRuntime, message, state);
  //   expect(result.values?.onboardingStage).toBe('relationship_exploration');
  //   expect(result.text).toContain('Important task: Onboarding guidelines Context for Seren');
  //   expect(mockMemgraphService.disconnect).toHaveBeenCalled();
  // });
});

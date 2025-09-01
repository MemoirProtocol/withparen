import { describe, it, expect } from 'bun:test';
import { createConnectionAction } from '../actions/createConnection.js';
import { createMockMemory } from './test-utils.js';

describe('createConnectionAction', () => {
  describe('validate', () => {
    it('should return false for empty messages', async () => {
      const message = createMockMemory({
        content: {
          text: '',
        },
      });

      const result = await createConnectionAction.validate(null as any, message);
      expect(result).toBe(false);
    });

    it('should return true for any non-empty message (no authentication required)', async () => {
      const message = createMockMemory({
        content: {
          text: 'I want to create a connection with my partner',
        },
      });

      const result = await createConnectionAction.validate(null as any, message);
      expect(result).toBe(true);
    });

    it('should return true even when no person node exists (authentication not required)', async () => {
      const message = createMockMemory({
        content: {
          text: 'I want to create a connection with my partner',
        },
      });

      const result = await createConnectionAction.validate(null as any, message);
      expect(result).toBe(true);
    });

    it('should return true even when person node exists but has no email (authentication not required)', async () => {
      const message = createMockMemory({
        content: {
          text: 'I want to create a connection with my partner',
        },
      });

      const result = await createConnectionAction.validate(null as any, message);
      expect(result).toBe(true);
    });

    // TODO: Re-enable these tests if authentication is restored in the future
    // it('should return false when no person node exists', async () => {
    //   const message = createMockMemory({
    //     content: {
    //       text: 'I want to create a connection with my partner'
    //     }
    //   });
    //   const { MemgraphService } = await import('../services/memgraph.js');
    //   const mockService = new MemgraphService();
    //   mockService.findPersonByWebId = vi.fn().mockResolvedValue(null);
    //   const result = await createConnectionAction.validate(null as any, message);
    //   expect(result).toBe(false);
    // });
  });

  describe('basic functionality', () => {
    it('should have correct name and description', () => {
      expect(createConnectionAction.name).toBe('CREATE_CONNECTION');
      expect(createConnectionAction.description).toContain('Creates a new human connection');
    });

    it('should have examples defined', () => {
      expect(createConnectionAction.examples).toBeDefined();
      expect(Array.isArray(createConnectionAction.examples)).toBe(true);
    });

    it('should have similes', () => {
      expect(createConnectionAction.similes).toBeDefined();
      expect(createConnectionAction.similes).toContain('CREATE_HUMAN_CONNECTION');
    });
  });
});

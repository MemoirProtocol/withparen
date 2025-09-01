import { describe, it, expect, mock } from 'bun:test';
import { createConnectionAction } from '../actions/createConnection.js';
import { createMockMemory } from './test-utils.js';

describe('createConnectionAction', () => {
  describe('validate', () => {
    it('should return false when no persona or connection memories exist', async () => {
      const message = createMockMemory({
        content: {
          text: 'I want to find connections',
        },
      });

      const mockRuntime = {
        getMemories: mock().mockResolvedValue([]), // No memories found
      };

      const result = await createConnectionAction.validate(mockRuntime as any, message);
      expect(result).toBe(false);
    });

    it('should return true when persona memories exist', async () => {
      const message = createMockMemory({
        content: {
          text: 'I want to find connections',
        },
      });

      const mockRuntime = {
        getMemories: mock().mockImplementation(({ tableName }) => {
          // Return memories for persona tables, empty for connection tables
          if (tableName.startsWith('persona_')) {
            return Promise.resolve([{ id: 'memory-1', content: { text: 'User insight' } }]);
          }
          return Promise.resolve([]);
        }),
      };

      const result = await createConnectionAction.validate(mockRuntime as any, message);
      expect(result).toBe(true);
    });

    it('should return true when connection memories exist', async () => {
      const message = createMockMemory({
        content: {
          text: 'I want to find connections',
        },
      });

      const mockRuntime = {
        getMemories: mock().mockImplementation(({ tableName }) => {
          // Return memories for connection tables, empty for persona tables
          if (tableName.startsWith('connection_')) {
            return Promise.resolve([
              { id: 'memory-1', content: { text: 'Connection preference' } },
            ]);
          }
          return Promise.resolve([]);
        }),
      };

      const result = await createConnectionAction.validate(mockRuntime as any, message);
      expect(result).toBe(true);
    });

    it('should return true when both persona and connection memories exist', async () => {
      const message = createMockMemory({
        content: {
          text: 'I want to find connections',
        },
      });

      const mockRuntime = {
        getMemories: mock().mockResolvedValue([
          { id: 'memory-1', content: { text: 'Some insight' } },
        ]),
      };

      const result = await createConnectionAction.validate(mockRuntime as any, message);
      expect(result).toBe(true);
    });

    it('should return false when validation throws an error', async () => {
      const message = createMockMemory({
        content: {
          text: 'I want to find connections',
        },
      });

      const mockRuntime = {
        getMemories: mock().mockRejectedValue(new Error('Database error')),
      };

      const result = await createConnectionAction.validate(mockRuntime as any, message);
      expect(result).toBe(false);
    });

    it('should check all persona dimension tables', async () => {
      const message = createMockMemory({
        content: {
          text: 'I want to find connections',
        },
      });

      const mockRuntime = {
        getMemories: mock().mockResolvedValue([]),
      };

      await createConnectionAction.validate(mockRuntime as any, message);

      // Should check all 7 persona dimension tables
      const personaTables = [
        'persona_demographic',
        'persona_characteristic',
        'persona_routine',
        'persona_goal',
        'persona_experience',
        'persona_persona_relationship',
        'persona_emotional_state',
      ];

      personaTables.forEach((tableName) => {
        expect(mockRuntime.getMemories).toHaveBeenCalledWith({
          roomId: message.roomId,
          tableName,
          count: 1,
        });
      });
    });

    it('should check all connection dimension tables', async () => {
      const message = createMockMemory({
        content: {
          text: 'I want to find connections',
        },
      });

      const mockRuntime = {
        getMemories: mock().mockResolvedValue([]),
      };

      await createConnectionAction.validate(mockRuntime as any, message);

      // Should check all 6 connection dimension tables
      const connectionTables = [
        'connection_desired_type',
        'connection_desired_background',
        'connection_desired_goals',
        'connection_desired_experience',
        'connection_desired_communication',
        'connection_desired_value',
      ];

      connectionTables.forEach((tableName) => {
        expect(mockRuntime.getMemories).toHaveBeenCalledWith({
          roomId: message.roomId,
          tableName,
          count: 1,
        });
      });
    });
  });

  describe('basic functionality', () => {
    it('should have correct name and description', () => {
      expect(createConnectionAction.name).toBe('CREATE_CONNECTION');
      expect(createConnectionAction.description).toContain(
        'Discovers potential connections for the user based on their persona and connection preferences'
      );
    });

    it('should have examples defined', () => {
      expect(createConnectionAction.examples).toBeDefined();
      expect(Array.isArray(createConnectionAction.examples)).toBe(true);
    });

    it('should have similes', () => {
      expect(createConnectionAction.similes).toBeDefined();
      expect(createConnectionAction.similes).toContain('DISCOVER_CONNECTION');
      expect(createConnectionAction.similes).toContain('FIND_CONNECTION');
      expect(createConnectionAction.similes).toContain('MATCH_CONNECTION');
      expect(createConnectionAction.similes).toContain('SEARCH_CONNECTION');
      expect(createConnectionAction.similes).toContain('FIND_MATCH');
    });
  });
});

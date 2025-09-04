import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getUsernameFromMemories,
  getUserInfo,
  updateEntityWithUsername,
} from '../utils/userUtils.js';
import { createMockRuntime } from './test-utils.js';

describe('userUtils', () => {
  let mockRuntime: any;

  beforeEach(() => {
    mockRuntime = createMockRuntime();
  });

  describe('getUsernameFromMemories', () => {
    it('should return username from entity metadata if available', async () => {
      const userId = 'test-user-id';
      const expectedUsername = 'testuser';

      mockRuntime.getEntityById.mockResolvedValue({
        id: userId,
        metadata: { username: expectedUsername },
      });

      const result = await getUsernameFromMemories(mockRuntime, userId);
      expect(result).toBe(expectedUsername);
    });

    it('should return username from message memories if not in entity metadata', async () => {
      const userId = 'test-user-id';
      const expectedUsername = 'testuser';

      // Entity has no username
      mockRuntime.getEntityById.mockResolvedValue({
        id: userId,
        metadata: {},
      });

      // But message memories have it
      mockRuntime.getMemories.mockResolvedValue([
        {
          id: 'message-1',
          entityId: userId,
          metadata: { entityUserName: expectedUsername },
        },
      ]);

      const result = await getUsernameFromMemories(mockRuntime, userId);
      expect(result).toBe(expectedUsername);
    });

    it('should return undefined if username not found anywhere', async () => {
      const userId = 'test-user-id';

      mockRuntime.getEntityById.mockResolvedValue({
        id: userId,
        metadata: {},
      });

      mockRuntime.getMemories.mockResolvedValue([]);

      const result = await getUsernameFromMemories(mockRuntime, userId);
      expect(result).toBeUndefined();
    });

    it('should handle errors gracefully', async () => {
      const userId = 'test-user-id';

      mockRuntime.getEntityById.mockRejectedValue(new Error('Database error'));

      const result = await getUsernameFromMemories(mockRuntime, userId);
      expect(result).toBeUndefined();
    });
  });

  describe('getUserInfo', () => {
    it('should return display name and username from entity metadata', async () => {
      const userId = 'test-user-id';
      const expectedName = 'Test User';
      const expectedUsername = 'testuser';

      mockRuntime.getEntityById.mockResolvedValue({
        id: userId,
        metadata: {
          name: expectedName,
          username: expectedUsername,
        },
      });

      const result = await getUserInfo(mockRuntime, userId);
      expect(result.displayName).toBe(expectedName);
      expect(result.username).toBe(expectedUsername);
    });

    it('should fallback to username for display name if name not available', async () => {
      const userId = 'test-user-id';
      const expectedUsername = 'testuser';

      mockRuntime.getEntityById.mockResolvedValue({
        id: userId,
        metadata: { username: expectedUsername },
      });

      const result = await getUserInfo(mockRuntime, userId);
      expect(result.displayName).toBe(expectedUsername);
      expect(result.username).toBe(expectedUsername);
    });

    it('should get username from memories if not in entity metadata', async () => {
      const userId = 'test-user-id';
      const expectedUsername = 'testuser';

      mockRuntime.getEntityById.mockResolvedValue({
        id: userId,
        metadata: {},
      });

      mockRuntime.getMemories.mockResolvedValue([
        {
          id: 'message-1',
          entityId: userId,
          metadata: { entityUserName: expectedUsername },
        },
      ]);

      const result = await getUserInfo(mockRuntime, userId);
      expect(result.username).toBe(expectedUsername);
    });

    it('should use fallback display name if no name or username available', async () => {
      const userId = 'test-user-id';

      mockRuntime.getEntityById.mockResolvedValue({
        id: userId,
        metadata: {},
      });

      mockRuntime.getMemories.mockResolvedValue([]);

      const result = await getUserInfo(mockRuntime, userId);
      expect(result.displayName).toBe('your connection');
      expect(result.username).toBeUndefined();
    });
  });

  describe('updateEntityWithUsername', () => {
    it('should update entity metadata with username from memories', async () => {
      const userId = 'test-user-id';
      const expectedUsername = 'testuser';

      const entity = {
        id: userId,
        metadata: {},
      };

      mockRuntime.getEntityById.mockResolvedValue(entity);
      mockRuntime.getMemories.mockResolvedValue([
        {
          id: 'message-1',
          entityId: userId,
          metadata: { entityUserName: expectedUsername },
        },
      ]);

      await updateEntityWithUsername(mockRuntime, userId);

      expect(mockRuntime.updateEntity).toHaveBeenCalledWith({
        ...entity,
        metadata: {
          username: expectedUsername,
        },
      });
    });

    it('should not update if entity already has username', async () => {
      const userId = 'test-user-id';
      const existingUsername = 'existing';

      mockRuntime.getEntityById.mockResolvedValue({
        id: userId,
        metadata: { username: existingUsername },
      });

      await updateEntityWithUsername(mockRuntime, userId);

      expect(mockRuntime.updateEntity).not.toHaveBeenCalled();
    });

    it('should handle missing entity gracefully', async () => {
      const userId = 'test-user-id';

      mockRuntime.getEntityById.mockResolvedValue(null);

      await updateEntityWithUsername(mockRuntime, userId);

      expect(mockRuntime.updateEntity).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const userId = 'test-user-id';

      mockRuntime.getEntityById.mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(updateEntityWithUsername(mockRuntime, userId)).resolves.toBeUndefined();
    });
  });
});

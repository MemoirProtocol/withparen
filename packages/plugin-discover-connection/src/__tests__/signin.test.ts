import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import { signinAction } from '../actions/signin';
import { MemgraphService } from '../services/memgraph';
import { createMockRuntime, createMockMemory } from './test-utils';
import { logger } from '@elizaos/core';

describe('Signin Action', () => {
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
      createPerson: mock(() => Promise.resolve()),
      findPersonByWebId: mock(() => Promise.resolve(null)),
    };

    // Mock the constructor to return our mock instance
    spyOn(MemgraphService.prototype, 'connect').mockImplementation(mockMemgraphService.connect);
    spyOn(MemgraphService.prototype, 'disconnect').mockImplementation(
      mockMemgraphService.disconnect
    );
    spyOn(MemgraphService.prototype, 'createPerson').mockImplementation(
      mockMemgraphService.createPerson
    );
    spyOn(MemgraphService.prototype, 'findPersonByWebId').mockImplementation(
      mockMemgraphService.findPersonByWebId
    );
  });

  it('should validate Firebase authentication messages', async () => {
    const validMessage1 = createMockMemory({
      content: {
        text: 'User has successfully authenticated. Firebase identity data: {"id": "test123", "email": "test@example.com"}',
      },
    });

    const validMessage2 = createMockMemory({
      content: {
        text: 'User has authenticated their email and wish to sign in. Firebase identity data: {"id": "test123", "email": "test@example.com"}',
      },
    });

    const invalidMessage = createMockMemory({
      content: {
        text: 'Just a regular message',
      },
    });

    expect(await signinAction.validate(mockRuntime, validMessage1)).toBe(true);
    expect(await signinAction.validate(mockRuntime, validMessage2)).toBe(true);
    expect(await signinAction.validate(mockRuntime, invalidMessage)).toBe(false);
  });

  it('should extract Firebase data and create Person node', async () => {
    const message = createMockMemory({
      entityId: 'user123',
      content: {
        text: `User has successfully authenticated. Firebase identity data:
        {
          "id": "firebase123",
          "email": "test@example.com",
          "token": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjJiN2JhZmIyZjEwY2FlMmIxZjA3ZjM4MTZjNTQyMmJlY2NhNWMyMjMiLCJ0eXAiOiJKV1QifQ",
          "authorId": "author456",
          "emailVerified": true
        }`,
      },
    });

    const mockPerson = {
      webId: 'user123',
      email: 'test@example.com',
      firebaseId: 'firebase123',
      firebaseToken:
        'eyJhbGciOiJSUzI1NiIsImtpZCI6IjJiN2JhZmIyZjEwY2FlMmIxZjA3ZjM4MTZjNTQyMmJlY2NhNWMyMjMiLCJ0eXAiOiJKV1QifQ',
      authorId: 'author456',
      createdAt: '2023-01-01T00:00:00.000Z',
      updatedAt: '2023-01-01T00:00:00.000Z',
    };

    mockMemgraphService.createPerson.mockImplementation(() => Promise.resolve(mockPerson));

    const result = await signinAction.handler(mockRuntime, message, undefined, {});

    expect(mockMemgraphService.connect).toHaveBeenCalled();
    expect(mockMemgraphService.findPersonByWebId).toHaveBeenCalledWith('user123');
    expect(mockMemgraphService.createPerson).toHaveBeenCalledWith(
      'user123',
      'test@example.com',
      'firebase123',
      'eyJhbGciOiJSUzI1NiIsImtpZCI6IjJiN2JhZmIyZjEwY2FlMmIxZjA3ZjM4MTZjNTQyMmJlY2NhNWMyMjMiLCJ0eXAiOiJKV1QifQ',
      'author456'
    );
    expect(mockMemgraphService.disconnect).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.values?.webId).toBe('user123');
    expect(result.values?.email).toBe('test@example.com');
    expect(result.values?.personCreated).toBe(true);
    expect(result.text).toBe(''); // No text response
  });

  it('should handle extraction errors gracefully', async () => {
    const message = createMockMemory({
      entityId: 'user123',
      content: {
        text: 'User has successfully authenticated. Firebase identity data: invalid json',
      },
    });

    const result = await signinAction.handler(mockRuntime, message, undefined, {});

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(mockMemgraphService.disconnect).toHaveBeenCalled();
  });

  it('should handle missing authorId gracefully', async () => {
    const message = createMockMemory({
      entityId: 'user123',
      content: {
        text: `User has successfully authenticated. Firebase identity data:
        {
          "id": "firebase123",
          "email": "test@example.com",
          "token": "test-token"
        }`,
      },
    });

    const mockPerson = {
      webId: 'user123',
      email: 'test@example.com',
      firebaseId: 'firebase123',
      firebaseToken: 'test-token',
      authorId: undefined,
      createdAt: '2023-01-01T00:00:00.000Z',
      updatedAt: '2023-01-01T00:00:00.000Z',
    };

    mockMemgraphService.createPerson.mockImplementation(() => Promise.resolve(mockPerson));

    const result = await signinAction.handler(mockRuntime, message, undefined, {});

    expect(mockMemgraphService.connect).toHaveBeenCalled();
    expect(mockMemgraphService.findPersonByWebId).toHaveBeenCalledWith('user123');
    expect(mockMemgraphService.createPerson).toHaveBeenCalledWith(
      'user123',
      'test@example.com',
      'firebase123',
      'test-token',
      undefined
    );
    expect(result.success).toBe(true);
    expect(result.values?.personCreated).toBe(true);
    expect(result.text).toBe(''); // No text response
  });

  it('should skip creation when Person node already exists', async () => {
    const message = createMockMemory({
      entityId: 'user123',
      content: {
        text: `User has successfully authenticated. Firebase identity data:
        {
          "id": "firebase123",
          "email": "test@example.com",
          "token": "test-token",
          "authorId": "author456"
        }`,
      },
    });

    const existingPerson = {
      webId: 'user123',
      email: 'test@example.com',
      firebaseId: 'firebase123',
      firebaseToken: 'test-token',
      authorId: 'author456',
      createdAt: '2023-01-01T00:00:00.000Z',
      updatedAt: '2023-01-01T00:00:00.000Z',
    };

    mockMemgraphService.findPersonByWebId.mockImplementation(() => Promise.resolve(existingPerson));

    const result = await signinAction.handler(mockRuntime, message, undefined, {});

    expect(mockMemgraphService.connect).toHaveBeenCalled();
    expect(mockMemgraphService.findPersonByWebId).toHaveBeenCalledWith('user123');
    expect(mockMemgraphService.createPerson).not.toHaveBeenCalled(); // Should not create new person
    expect(mockMemgraphService.disconnect).toHaveBeenCalled();

    expect(result.success).toBe(true);
    expect(result.values?.webId).toBe('user123');
    expect(result.values?.personCreated).toBe(false);
    expect(result.values?.personAlreadyExisted).toBe(true);
    expect(result.text).toBe(''); // No text response
  });

  it('should handle memgraph service errors gracefully', async () => {
    const message = createMockMemory({
      entityId: 'user123',
      content: {
        text: `User has successfully authenticated. Firebase identity data:
        {
          "id": "firebase123",
          "email": "test@example.com",
          "token": "test-token",
          "authorId": "author456"
        }`,
      },
    });

    mockMemgraphService.findPersonByWebId.mockImplementation(() =>
      Promise.reject(new Error('Database connection failed'))
    );

    const result = await signinAction.handler(mockRuntime, message, undefined, {});

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('Database connection failed');
    expect(result.text).toBe(''); // No text response even on error
    expect(mockMemgraphService.disconnect).toHaveBeenCalled();
  });
});

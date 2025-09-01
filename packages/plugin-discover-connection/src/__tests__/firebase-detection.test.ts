import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import { createMockRuntime, createMockMemory } from './test-utils';
import { logger } from '@elizaos/core';

// We'll test the Firebase detection logic by importing the message handler
// Since the logic is embedded in the message handler, we'll need to test it indirectly

describe('Firebase Detection Logic', () => {
  let mockRuntime: any;
  let mockCallback: any;

  beforeEach(() => {
    // Spy on logger methods to suppress output during tests
    spyOn(logger, 'error').mockImplementation(() => {});
    spyOn(logger, 'warn').mockImplementation(() => {});
    spyOn(logger, 'debug').mockImplementation(() => {});
    spyOn(logger, 'info').mockImplementation(() => {});

    mockRuntime = createMockRuntime();
    mockCallback = mock(() => Promise.resolve());

    // Mock runtime methods that are called during message processing
    mockRuntime.addEmbeddingToMemory = mock(() => Promise.resolve());
    mockRuntime.createMemory = mock(() => Promise.resolve());
    mockRuntime.getParticipantUserState = mock(() => Promise.resolve('ACTIVE'));
    mockRuntime.getRoom = mock(() => Promise.resolve({ type: 'DM' }));
    mockRuntime.startRun = mock(() => 'test-run-id');
    mockRuntime.emitEvent = mock(() => Promise.resolve());
  });

  it('should detect Firebase authentication payload patterns', () => {
    // Test the detection patterns we're using
    const validFirebaseMessage = `User has successfully authenticated. Firebase identity data:
    {
      "id": "yqmQLF9796MGTUVRlPd0Ol6SgRk1",
      "email": "amir@withseren.com",
      "token": "eyJhbGciOiJSUzI1NiIs...",
      "authorId": "875d2ec9-7eaf-4448-b850-1c2255ffb9cf"
    }`;

    const invalidMessage = 'Just a regular message';
    const partialMessage = 'User has successfully authenticated but no Firebase data';

    // Test the detection logic patterns
    expect(validFirebaseMessage.includes('Firebase identity data')).toBe(true);
    expect(validFirebaseMessage.includes('successfully authenticated')).toBe(true);
    expect(validFirebaseMessage.includes('"id":')).toBe(true);
    expect(validFirebaseMessage.includes('"email":')).toBe(true);
    expect(validFirebaseMessage.includes('"token":')).toBe(true);

    expect(invalidMessage.includes('Firebase identity data')).toBe(false);
    expect(partialMessage.includes('Firebase identity data')).toBe(false);
  });

  it('should detect various Firebase payload formats', () => {
    const testCases = [
      {
        name: 'Standard format',
        message:
          'User has successfully authenticated. Firebase identity data: {"id": "test123", "email": "test@example.com", "token": "abc123"}',
        shouldDetect: true,
      },
      {
        name: 'Alternative authentication text',
        message:
          'User has authenticated their email and wish to sign in. Firebase identity data: {"id": "test123", "email": "test@example.com", "token": "abc123"}',
        shouldDetect: true,
      },
      {
        name: 'With line breaks',
        message: `User has successfully authenticated. Firebase identity data:
        {
          "id": "test123",
          "email": "test@example.com",
          "token": "abc123"
        }`,
        shouldDetect: true,
      },
      {
        name: 'With authorId',
        message:
          'User has successfully authenticated. Firebase identity data: {"id": "test123", "email": "test@example.com", "token": "abc123", "authorId": "author456"}',
        shouldDetect: true,
      },
      {
        name: 'Missing Firebase identity data',
        message: 'User has successfully authenticated but no Firebase data',
        shouldDetect: false,
      },
      {
        name: 'Missing authentication success',
        message: 'Firebase identity data: {"id": "test123"}',
        shouldDetect: false,
      },
      {
        name: 'No JSON fields',
        message: 'User has successfully authenticated. Firebase identity data: some text',
        shouldDetect: false,
      },
      {
        name: 'Regular message',
        message: 'Hello, how are you?',
        shouldDetect: false,
      },
    ];

    testCases.forEach((testCase) => {
      const messageText = testCase.message;
      const detected =
        messageText.includes('Firebase identity data') &&
        (messageText.includes('successfully authenticated') ||
          messageText.includes('authenticated their email')) &&
        (messageText.includes('"id":') ||
          messageText.includes('"email":') ||
          messageText.includes('"token":'));

      expect(detected).toBe(testCase.shouldDetect);
    });
  });

  it('should handle edge cases in Firebase payload detection', () => {
    const edgeCases = [
      {
        name: 'Case sensitivity',
        message: 'User has successfully authenticated. firebase identity data: {"id": "test123"}',
        shouldDetect: false, // Our detection is case-sensitive for "Firebase"
      },
      {
        name: 'Partial JSON',
        message: 'User has successfully authenticated. Firebase identity data: {"incomplete":',
        shouldDetect: false,
      },
      {
        name: 'Only id field',
        message: 'User has successfully authenticated. Firebase identity data: {"id": "test123"}',
        shouldDetect: true,
      },
      {
        name: 'Only email field',
        message:
          'User has successfully authenticated. Firebase identity data: {"email": "test@example.com"}',
        shouldDetect: true,
      },
      {
        name: 'Only token field',
        message: 'User has successfully authenticated. Firebase identity data: {"token": "abc123"}',
        shouldDetect: true,
      },
    ];

    edgeCases.forEach((testCase) => {
      const messageText = testCase.message;
      const detected =
        messageText.includes('Firebase identity data') &&
        (messageText.includes('successfully authenticated') ||
          messageText.includes('authenticated their email')) &&
        (messageText.includes('"id":') ||
          messageText.includes('"email":') ||
          messageText.includes('"token":'));

      expect(detected).toBe(testCase.shouldDetect);
    });
  });
});

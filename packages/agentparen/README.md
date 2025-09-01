# Agent Quinn

Quinn is an AI agent focused on connection discovery, helping users find meaningful connections based on their passions, challenges, and goals.

## Features

- **Connection Discovery**: Helps users discover new meaningful connections
- **Passion-Based Matching**: Matches people based on shared interests and complementary goals
- **PEACOCK Framework**: Uses structured persona analysis for better understanding
- **Vector Similarity Search**: Advanced matching algorithms for compatibility
- **Natural Onboarding**: Conversational flow to understand user needs
- **Privacy-First**: Keeps all conversations private and secure

## Getting Started

```bash
# Install dependencies
npm install

# Start Quinn in development mode
elizaos dev

# Or start Quinn in production mode
elizaos start
```

## Development

```bash
# Start development with hot-reloading (recommended)
elizaos dev

# OR start without hot-reloading
elizaos start
# Note: When using 'start', you need to rebuild after changes:
# bun run build

# Test the project
elizaos test
```

## Testing

ElizaOS provides a comprehensive testing structure for projects:

### Test Structure

- **Component Tests** (`__tests__/` directory):

  - **Unit Tests**: Test individual functions and components in isolation
  - **Integration Tests**: Test how components work together
  - Run with: `elizaos test component`

- **End-to-End Tests** (`e2e/` directory):

  - Test the project within a full ElizaOS runtime
  - Run with: `elizaos test e2e`

- **Running All Tests**:
  - `elizaos test` runs both component and e2e tests

### Writing Tests

Component tests use Vitest:

```typescript
// Unit test example (__tests__/config.test.ts)
describe('Configuration', () => {
  it('should load configuration correctly', () => {
    expect(config.debug).toBeDefined();
  });
});

// Integration test example (__tests__/integration.test.ts)
describe('Integration: Plugin with Character', () => {
  it('should initialize character with plugins', async () => {
    // Test interactions between components
  });
});
```

E2E tests use ElizaOS test interface:

```typescript
// E2E test example (e2e/project.test.ts)
export class ProjectTestSuite implements TestSuite {
  name = 'project_test_suite';
  tests = [
    {
      name: 'project_initialization',
      fn: async (runtime) => {
        // Test project in a real runtime
      },
    },
  ];
}

export default new ProjectTestSuite();
```

The test utilities in `__tests__/utils/` provide helper functions to simplify writing tests.

## How Quinn Works

1. **Onboarding**: Quinn guides users through understanding their passions, challenges, and connection preferences
2. **Profile Building**: Uses the PEACOCK framework to build comprehensive user profiles
3. **Connection Discovery**: When ready, users can trigger connection discovery to find compatible matches
4. **Smart Matching**: Uses vector similarity search and AI reasoning to evaluate compatibility
5. **Introduction**: Suggests the best matches and facilitates introductions

## Configuration

Customize Quinn by modifying:

- `src/index.ts` - Main entry point and plugin configuration
- `src/character.ts` - Quinn's personality and conversation style

## Plugins Used

- `@elizaos/plugin-quinn` - Core connection discovery functionality
- `@elizaos/plugin-sql` - Database operations
- `@elizaos/plugin-google-genai` - AI model integration
- `@elizaos/plugin-telegram` - Telegram client support

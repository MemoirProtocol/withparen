# @elizaos/plugin-ocean

Ocean Protocol integration for ElizaOS that extracts memories from conversations and publishes them as DataNFTs using Safe smart accounts.

## Features

- 🧠 **Automatic Memory Extraction**: Uses PEACOCK framework to extract valuable memories from conversations
- 🌊 **Ocean Protocol Integration**: Publishes memories as DataNFTs on Ocean Protocol
- 🔐 **Safe Wallet Integration**: Uses user's Safe smart accounts for secure asset ownership
- ⛵ **Optimism Network**: Publishes on Optimism for lower gas costs
- 🤖 **AI-Powered Quality Assessment**: Validates and scores memories before publication
- 🛡️ **Privacy Protection**: Sanitizes sensitive information before publishing
- 💰 **Automated Monetization**: Converts conversation insights into tradeable data assets

## Installation

```bash
bun add @elizaos/plugin-ocean
```

## Prerequisites

1. **Ocean Node**: Set up and running Ocean Node locally
2. **Plugin Safe**: `@elizaos/plugin-safe` must be configured for wallet management
3. **Optimism Network**: Access to Optimism RPC endpoint
4. **AI Model**: Access to text models for memory extraction

## Configuration

Add to your `.env` file:

```bash
# Ocean Node Configuration
OCEAN_NODE_GATEWAY=http://localhost:8000/api/aquarius/assets/ddo
OCEAN_NODE_URL=http://localhost:8001

# Optimism Network
OPTIMISM_RPC_URL=https://mainnet.optimism.io
OPTIMISM_CHAIN_ID=10

# Publishing Behavior
OCEAN_AUTO_PUBLISH=true
OCEAN_MIN_MEMORY_LENGTH=50
OCEAN_PUBLISH_INTERVAL=300000  # 5 minutes

# DataNFT Configuration
OCEAN_DEFAULT_LICENSE=CC-BY-4.0
OCEAN_TAG_PREFIX=eliza-memory
```

## Usage

### Basic Setup

```typescript
import { oceanPlugin } from '@elizaos/plugin-ocean';

const runtime = new AgentRuntime({
  // ... other config
  plugins: [
    oceanPlugin,
    // ... other plugins
  ],
});
```

### Manual Memory Publishing

Users can manually request memory publication:

```
User: "I want to publish my career goals as a DataNFT"
Agent: "I can help you publish your career transition insights as a DataNFT..."
```

### Viewing Published Assets

Users can view their DataNFT portfolio:

```
User: "Show me my Ocean Protocol assets"
Agent: "📊 Your Ocean Protocol Portfolio: 5 DataNFTs published..."
```

## Architecture

### Components

1. **OceanPublishingService**: Handles Ocean Node API integration and DataNFT creation
2. **Memory Extractor Evaluator**: Extracts memories using PEACOCK framework
3. **Actions**: `publishMemory` and `listAssets` for user interaction
4. **Providers**: Supply Ocean asset context for conversations

### Memory Dimensions (PEACOCK Framework)

- **Demographic**: Age, location, environment, static facts
- **Characteristic**: Personality traits, communication styles
- **Routine**: Daily habits, behavioral patterns
- **Goal**: Ambitions, future plans, objectives
- **Experience**: Past events, significant life moments
- **Persona Relationship**: Social connections, interactions
- **Emotional State**: Feelings, moods, emotional patterns

### Data Flow

1. **Conversation** → Evaluator extracts memories
2. **Memory Validation** → Quality and privacy checks
3. **DataNFT Creation** → Ocean Protocol DDO generation
4. **Safe Wallet Signing** → User's Safe account signs transaction
5. **Ocean Node Publishing** → Asset published to network
6. **Memory Storage** → Reference cached for future queries

## API Reference

### OceanPublishingService

```typescript
// Publish memory as DataNFT
const asset = await oceanService.publishMemoryAsDataNFT(memory);

// Get user's published assets
const assets = await oceanService.getAssetsByOwner(userAddress);

// Get asset by DID
const asset = await oceanService.getAssetByDID(did);

// Check if memory already published
const exists = await oceanService.isMemoryPublished(memory);
```

### Types

```typescript
interface MemoryDimension {
  type: MemoryDimensionType;
  content: string;
  evidence: string;
  timestamp: number;
  userId: UUID;
  roomId: UUID;
  confidence: number;
}

interface PublishedAsset {
  did: string;
  nftAddress: string;
  datatokenAddress: string;
  txHash: string;
  metadata: DataNFTMetadata;
  publishedAt: number;
}
```

## Security & Privacy

### Data Sanitization

- Removes email addresses, phone numbers
- Masks credit card numbers and SSNs
- Filters sensitive personal information

### Quality Controls

- Minimum content length validation
- Confidence score thresholds
- Duplicate detection
- Rate limiting protection

### Ownership

- Users maintain full ownership via Safe wallets
- DataNFTs are tradeable assets
- Smart contract-based access control

## Development

### Building

```bash
bun run build
```

### Testing

```bash
bun test
```

### Linting

```bash
bun run lint
```

## Ocean Node Setup

1. **Install Ocean Node**:
   ```bash
   git clone https://github.com/oceanprotocol/ocean-node
   cd ocean-node
   ```

2. **Configure Environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start Ocean Node**:
   ```bash
   docker-compose up -d
   ```

4. **Verify Connection**:
   ```bash
   curl http://localhost:8001/api/v1/node/status
   ```

## Integration with Safe Wallets

The plugin integrates with `@elizaos/plugin-safe` to:

- Use user's Safe smart account as DataNFT owner
- Sign transactions with delegated permissions
- Manage gas fees and transaction execution
- Maintain secure asset ownership

## Use Cases

### For Users
- **Personal Data Monetization**: Turn conversation insights into income
- **Privacy-Controlled Sharing**: Share anonymized behavioral data
- **AI Training Contribution**: Provide data for AI research
- **Market Research Participation**: Sell consumer insights

### For Data Buyers
- **Behavioral Analysis**: Purchase anonymized user patterns
- **Market Research**: Access consumer preference data
- **AI Training Data**: High-quality, consent-based datasets
- **Academic Research**: Behavioral and psychological studies

## Roadmap

- [ ] Multi-chain support (Ethereum, Polygon)
- [ ] Enhanced privacy with zero-knowledge proofs
- [ ] Bulk memory publishing
- [ ] Revenue sharing mechanisms
- [ ] Advanced memory categorization
- [ ] Integration with external data marketplaces

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- GitHub Issues: [Create Issue](https://github.com/elizaOS/eliza/issues)
- Documentation: [Ocean Protocol Docs](https://docs.oceanprotocol.com/)
- ElizaOS Docs: [ElizaOS Documentation](https://elizaos.github.io/eliza/)

---

Built with ❤️ for the decentralized AI economy
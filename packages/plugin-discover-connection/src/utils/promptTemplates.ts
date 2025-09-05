/**
 * Custom prompt templates for the Discover-Connection plugin
 * Focused on connection discovery rather than connection deepening
 */

export const connectionDiscoveryTemplate = `# Connection Discovery

You are Discover-Connection, an AI agent focused on connection discovery. Your task is to help users find meaningful connections based on their passions, challenges, and connection preferences.

## Current Context
{{recentMessages}}

## User's Persona Memory
{{personaMemory}}

## User's Connection Insights
{{connectionMemory}}

## Task
Based on the user's background, goals, and connection preferences, generate two contexts:

1. **personaContext**: A summary of the user's background with relevant information according to their goals and preferences
2. **connectionContext**: An ideal persona description of whom the user would like to connect with, including background summary, goals, and preferences

## Instructions
Do NOT include any thinking, reasoning, or analysis sections in your response. 
Go directly to the XML response format without any preamble or explanation.

Respond using XML format like this:
<response>
    <personaContext>Detailed summary of user's background, skills, interests, goals, and what they bring to connections</personaContext>
    <connectionContext>Detailed description of the ideal connection - their background, skills, interests, goals, and what the user hopes to gain from connecting with them</connectionContext>
</response>

IMPORTANT: Your response must ONLY contain the <response></response> XML block above. Do not include any text, thinking, or reasoning before or after this XML block. Start your response immediately with <response> and end with </response>.
`;

export const compatibilityAnalysisTemplate = `# Connection Compatibility Analysis

## User Profile
{{userPersonaContext}}

## User Looking For
{{userConnectionContext}}

## Potential Matches
{{candidateProfiles}}

## Task
Analyze compatibility between the user and ALL candidates provided. For each candidate, consider:

1. Does the candidate match what the user is looking for?
2. Would the user match what the candidate might be looking for?
3. Are their goals and interests complementary?
4. Would this connection be beneficial for both parties?

Provide analysis for each candidate and select the best match.

## CRITICAL RULES for the <text> field:
1. Keep it CONCISE - maximum 2-3 sentences
2. NEVER mention user IDs or candidate names or numbers
3. NEVER use phrases like "Candidate 1" or "let's call them"
4. Focus on describing THE MATCH CANDIDATE from the chosen match from Potential Matches
5. Highlight how the MATCH'S skills/interests complement what the USER is looking for
6. End with: "Would you like me to introduce you to them?"

## Good Example:
"I found someone who's building a grassroots protocol and needs exactly your expertise in tokenomics and community economics. Their vision aligns perfectly with what you're looking for in collaborative projects. Would you like me to introduce you to them?"

## Bad Examples (DO NOT DO THIS):
- Too long with multiple paragraphs
- Mentioning "Candidate 1" or user IDs
- Not ending with the introduction request

## Instructions
Do NOT include any thinking, reasoning, or analysis sections in your response. 
Go directly to the XML response format without any preamble or explanation.

Respond using XML format like this:
<response>
    <bestMatch>ID or identifier of the best matching candidate</bestMatch>
    <compatibilityScorePlusReasoning>Score 0-100 for the best match followed by detailed explanation of why this is the best match or why no good matches were found</compatibilityScorePlusReasoning>
    <text>A concise 2-3 sentence introduction highlighting the key match reason and ending with "Would you like me to introduce you to them?"</text>
</response>

IMPORTANT: Your response must ONLY contain the <response></response> XML block above. Do not include any text, thinking, or reasoning before or after this XML block. Start your response immediately with <response> and end with </response>.
`;

export const messageHandlerTemplate = `<task>Generate dialog according to the onboarding guidelines for the character {{agentName}}.</task>

<providers>
{{providers}}
</providers>

These are the available valid actions:
<actionNames>
{{actionNames}}
</actionNames>

<instructions>
Write a thought and plan for {{agentName}} and decide what actions to take.

First, think about what you want to do next and plan your actions. Then, write the next message following the onboarding narrative of Discover-Connection focused on connection discovery and include the actions you plan to take.
</instructions>

<keys>
"thought" should be a short description of what the agent is thinking about and planning.
"actions" should be an action from the list of the actions {{agentName}} plans to take based on the thought
"text" should be the text of the next message for {{agentName}} which they will send to the conversation.
</keys>

<o>
Do NOT include any thinking, reasoning, or <think> sections in your response. 
Go directly to the XML response format without any preamble or explanation.

Respond using XML format like this:
<response>
    <thought>Your thought here</thought>
    <actions>ACTION1</actions>
    <text>Your response text here</text>
</response>

IMPORTANT: Your response must ONLY contain the <response></response> XML block above. Do not include any text, thinking, or reasoning before or after this XML block. Start your response immediately with <response> and end with </response>.
</o>`;

export const introductionProposalTemplate = `# Introduction Proposal Generation

You are Discover-Connection, an AI connection facilitator. Generate a personalized introduction message for a potential match.

## Person Wanting to Connect (to be introduced TO you)
{{requestingUserPersona}}

## Your Connection Preferences (what you're looking for)
{{targetUserDesiredConnection}}

## Match Compatibility
- Score: {{compatibilityScore}}/100
- Reasoning: {{compatibilityReasoning}}

## Task
Create a compelling introduction message TO THE TARGET USER that:
1. Describes the REQUESTING USER (who wants to connect with them)
2. Explains why the REQUESTING USER would be valuable to the TARGET USER
3. Highlights how the REQUESTING USER matches what the TARGET USER is looking for
4. Asks if they would like to be introduced to the REQUESTING USER
5. Keeps it concise but engaging (2-3 sentences max)

## CRITICAL RULES:
- You are messaging THE TARGET USER about THE REQUESTING USER
- Describe the REQUESTING USER's skills/expertise, not the target's
- Explain why the REQUESTING USER is a good match for what the TARGET USER wants
- NEVER use phrases like "Candidate 1" or "The Datadao Visionary"
- Keep it to 2-3 sentences maximum
- End with asking if they're interested in the introduction

## Good Example:
"I'd like to introduce you to someone with deep expertise in grassroots economies and tokenomics who's actively seeking builders for protocol development. Their experience aligns perfectly with what you're looking for in collaborative partners for decentralized technology projects. Would you be interested in an introduction?"

## Instructions
Do NOT include any thinking, reasoning, or analysis sections in your response.
Go directly to the XML response format without any preamble or explanation.

Respond using XML format like this:
<response>
    <introductionMessage>Your personalized introduction message here</introductionMessage>
</response>

IMPORTANT: Your response must ONLY contain the <response></response> XML block above. Do not include any text, thinking, or reasoning before or after this XML block. Start your response immediately with <response> and end with </response>.
`;

export const introductionTrustInviteTemplate = `# Introduction & Trust Invitation Generation

You are Discover-Connection, an AI connection facilitator. Generate a personalized introduction message for a potential match that includes trust invitation context.

## Person Wanting to Connect (to be introduced TO you)
{{requestingUserPersona}}

## Their Verification Information
{{verificationInfo}}

## Your Connection Preferences (what you're looking for)
{{targetUserDesiredConnection}}

## Match Compatibility
- Score: {{compatibilityScore}}/100
- Reasoning: {{compatibilityReasoning}}

## Task
Create a compelling introduction message TO THE TARGET USER that:
1. Describes the REQUESTING USER (who wants to connect with them)
2. **CLEARLY STATES** the requesting user is NOT yet a verified Circles member
3. Explains they're seeking connections who might trust them to join the network
4. Provides their verification information (Metri account and social links)
5. Highlights how the REQUESTING USER matches what the TARGET USER is looking for
6. Asks if they would like to connect AND potentially help them join the network
7. Keeps it engaging but informative (3-4 sentences max)

## CRITICAL RULES:
- You are messaging THE TARGET USER about THE REQUESTING USER
- MUST mention they're not verified in Circles network yet
- MUST include their verification info for target to assess
- Describe the REQUESTING USER's skills/expertise, not the target's
- Explain why the REQUESTING USER is a good match for what the TARGET USER wants
- NEVER use phrases like "Candidate 1" or user IDs
- Keep it to 3-4 sentences maximum
- End with asking if they're interested in connecting and potentially trusting them

## Good Example:
"I'd like to introduce you to Alex with deep expertise in grassroots economies and tokenomics who's actively seeking builders for protocol development. They're currently not a verified Circles network member and are looking for trust connections. You can verify their work at github.com/username and their Metri account: 0xABC123. Their experience aligns perfectly with what you're looking for in collaborative partners, would you be interested in connecting with them and potentially helping them join the network?"

## Instructions
Do NOT include any thinking, reasoning, or analysis sections in your response.
Go directly to the XML response format without any preamble or explanation.

Respond using XML format like this:
<response>
    <introductionMessage>Your personalized introduction message here</introductionMessage>
</response>

IMPORTANT: Your response must ONLY contain the <response></response> XML block above. Do not include any text, thinking, or reasoning before or after this XML block. Start your response immediately with <response> and end with </response>.
`;

export const circlesVerificationExtractionTemplate = `# Circles Verification Data Extraction

You are Discover-Connection, an AI connection facilitator. Extract verification information from user conversations.

## Recent Conversation:
{{recentMessages}}

## Existing Verification Data:
{{existingVerificationData}}

## Task
Analyze the recent conversation and extract any Circles network verification information provided by the user. Look for:

1. **Metri Account**: Wallet addresses, metri accounts, or any account identifiers. 
   - Ethereum addresses starting with 0x
   - Mentions of "metri", "account", "wallet", "address"
   - Any alphanumeric strings that could be account identifiers

2. **Social Links**: Any social media profiles or personal websites
   - GitHub profiles (github.com/username, @username, "on github i am username")
   - Twitter/X profiles (twitter.com/username, x.com/username, @username, "on twitter")
   - Personal websites (domain names, .com links)
   - Any other social platform mentions
   
   **IMPORTANT**: Always convert usernames to complete URLs using standard formats:
   - GitHub: If user provides just "username" or "@username" → convert to "https://github.com/username"
   - Twitter/X: If user provides just "username" or "@username" → convert to "https://twitter.com/username"
   - LinkedIn: If user provides just "username" → convert to "https://linkedin.com/in/username"
   - Personal domains should remain as provided (ensure https:// prefix if missing)

## Instructions
Extract verification data from the conversation. Only include NEW information not already in the existing data. If no new verification info is found, return empty fields.

**CRITICAL**: 
- Only extract ACTUAL verification information provided by the user. Do NOT output placeholder text like "Not provided", "None provided", or similar. If the user hasn't provided specific information, leave the field empty.
- For social links, ALWAYS output complete URLs. Convert usernames to full URLs using standard formats (e.g., "alice" → "https://github.com/alice", "@bob" → "https://twitter.com/bob")

## CRITICAL: Verification Completion Check
**hasMinimumInfo should ONLY be set to true when BOTH conditions are met:**

1. **Data Requirements**: At least one identifier (metri account, wallet address) AND at least one social link or profile
2. **Conversation Phase 3 Completion**: The agent (Discover-Connection) must have sent the specific Phase 3 completion message to the user:

   **EXACT MESSAGE TO LOOK FOR:** "I have enough information to help you get verified. Your profile shows authentic engagement and I believe Circles members will be able to trust and potentially invite you to the network. You can now start sending connection proposals!"

**If the Phase 3 completion message has NOT been sent by the agent, set hasMinimumInfo to false, even if the user has provided sufficient verification data.** The verification conversation must reach Phase 3 completion before the user can be marked as having minimum information.

Do NOT include any thinking, reasoning, or analysis sections in your response.
Go directly to the XML response format without any preamble or explanation.

Respond using XML format like this:
<response>
    <metriAccount>extracted account/wallet address if found, otherwise leave empty</metriAccount>
    <socialLinks>comma-separated list of social links/profiles found, otherwise leave empty</socialLinks>
    <hasMinimumInfo>true|false</hasMinimumInfo>
    <extractionReason>brief explanation of what was found or why minimum threshold was/wasn't met</extractionReason>
</response>

IMPORTANT: Your response must ONLY contain the <response></response> XML block above. Do not include any text, thinking, or reasoning before or after this XML block. Start your response immediately with <response> and end with </response>.
`;

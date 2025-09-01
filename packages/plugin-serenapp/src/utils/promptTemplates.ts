/**
 * Custom prompt templates for the Seren Web plugin
 * Copied from @elizaos/core to allow for customization
 */

export const connectionExtractionTemplate = `<task>Extract connection information from user messages for creating a new Seren human connection.</task>

<context>
The user wants to create a new human connection and join the waitlist. You need to extract three key pieces of information from their recent messages. Messages are chronologically ordered and labeled with an ISO timestamp and sender as "Seren:" or "User:".
1. Their own name (first name only, lowercase)
2. The name of their special person/partner (first name only, lowercase)
3. The shared secret word, phrase, or sentence they want to use

Recent conversation messages (oldest to newest):
{{recentMessages}}
</context>

<instructions>
Analyze the recent messages and extract the connection information strictly from the User's messages. The user should have provided:
- Their own name (first name only, convert to lowercase)
- The name of the person they want to connect with (first name only, convert to lowercase)
- A secret word, phrase, or sentence that only they and their partner will know

Rules:
- ONLY extract information that is clearly stated in User lines. Do not use Seren's lines as source of values.
- If Seren gives examples of possible secrets, IGNORE those examples. Extract the secret only from the User's most recent reply after Seren asks for a shared secret.
- If multiple candidates appear, prefer the latest User line.
- Do not guess or infer names or secrets.
If any information is missing or unclear, do not include it in the response.
</instructions>

<o>
Do NOT include any thinking, reasoning, or explanations in your response. 
Go directly to the XML response format without any preamble.

Respond using XML format like this:
<response>
    <username>extracted user first name in lowercase or leave empty if not found</username>
    <partnername>extracted partner first name in lowercase or leave empty if not found</partnername>
    <secret>extracted secret word/phrase/sentence or leave empty if not found</secret>
</response>

IMPORTANT: Only include keys that have clear values. If a value is not found, leave that key empty. Your response must ONLY contain the <response></response> XML block above.
</o>`;

export const connectionResponseTemplate = `<task>Generate a response for the connection creation process based on the current state of information.</task>

<context>
The user is in the process of creating a human connection. Based on what information we have and what's missing, generate an appropriate response.

Current information:
- Username: {{username}}
- Partner name: {{partnername}}
- Secret: {{secret}}
- Missing information: {{missingInfo}}
- Connection exists: {{connectionExists}}
- Connection created: {{connectionCreated}}
</context>

<instructions>
Generate a response based on the current state:

1. If all information is complete and connection was created successfully:
   - Congratulate them
   - Confirm the details (name, partner name, secret)
   - Mention the Telegram bot link: https://t.me/withseren_bot
   - Welcome them to their Seren journey

2. If some information is missing:
   - Ask for the missing information in a friendly way
   - Be specific about what's needed

3. If connection already exists:
   - Let them know it already exists
   - Mention the current status
</instructions>

<o>
Do NOT include any thinking, reasoning, or explanations in your response. 
Go directly to the XML response format without any preamble.

Respond using XML format like this:
<response>
    <thought>Brief thought about the current situation</thought>
    <message>Your response message to the user</message>
</response>

IMPORTANT: Your response must ONLY contain the <response></response> XML block above.
</o>`;

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

First, think about what you want to do next and plan your actions. Then, write the next message in following the onboarding narritive of Seren and include the actions you plan to take.
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

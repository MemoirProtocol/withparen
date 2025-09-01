/**
 * Custom prompt templates for the Deepen-Connection Web plugin
 * Copied from @elizaos/core to allow for customization
 */

export const authenticationExtractionTemplate = `<task>Extract authentication information from user messages for Deepen-Connection human connection verification.</task>

<context>
The user is trying to authenticate their connection to an existing human relationship. You need to extract three key pieces of information from their recent messages:
1. Their own name (if not mentioned, take it from conversation history)
2. The name of their connection/person/partner
3. The shared secret word, phrase or sentence they chose together

Recent conversation messages:
{{recentMessages}}
</context>

<instructions>
Analyze the recent messages carefully and extract the authentication information. Look for:

1. **User's name**: Usually confirmed when Deepen-Connection asks "Do you confirm this is the same first name..." and user says "yes"
2. **Partner's name**: When Deepen-Connection asks "What's the name of your connection?" - the user's response is the partner name
3. **Secret**: When Deepen-Connection asks "What's the secret known between you two..." - the user's response is the secret

Pay attention to the conversation flow:
- Deepen-Connection asks for name confirmation → User confirms
- Deepen-Connection asks "What's the name of your connection?" → User provides partner name  
- Deepen-Connection asks "What's the secret..." → User provides secret

IMPORTANT: Do not confuse the partner's name with the secret. They are different pieces of information.

If any information is missing or unclear, indicate what's missing.
</instructions>

<output>
Do NOT include any thinking, reasoning, or explanations in your response. 
Go directly to the XML response format without any preamble.

Respond using XML format like this:
<response>
    <userName>extracted user name or leave empty if not found</userName>
    <partnerName>extracted partner name or leave empty if not found</partnerName>
    <secret>extracted secret word/phrase or leave empty if not found</secret>
    <confidence>high/medium/low based on clarity of extraction</confidence>
    <missing>comma-separated list of missing information if any</missing>
</response>

IMPORTANT: Only extract information that is clearly stated. Do not guess or infer names or secrets. Your response must ONLY contain the <response></response> XML block above.
</output>`;

// A second-stage verifier that can flexibly compare a user's described secret
// against candidate HumanConnection secrets and metadata using contextual
// understanding rather than strict exact-string match.
export const authenticationFlexibleVerificationTemplate = `<task>Decide which, if any, of the candidate connections match the user's described shared secret and partner names, allowing for paraphrase and contextual matches.</task>

<context>
You have already extracted three fields from the conversation:
- userName: {{userName}}
- partnerName: {{partnerName}}
- userSecretText: {{userSecretText}}

You are also given a list of candidate HumanConnection nodes from the database that match the two partner names in some flexible way. Each candidate includes: partners[], secret (may be a phrase/sentence), optional connectionId, and status.

Candidates (JSON array):
{{candidatesJson}}
</context>

<instructions>
Your job is to select the single best-matching connection where the user's described secret is contextually equivalent to the candidate.secret, even if the exact wording differs. Consider synonyms, paraphrases, tense changes, small omissions/additions, and minor misspellings. If none are a reasonable match, choose "none".

Rules:
- Names have already been filtered; focus mainly on secret matching.
- Prefer a candidate whose secret best captures the core meaning of userSecretText.
- If multiple candidates are equally good, pick the one with status "active" over others; otherwise choose the first among equals.
- If userSecretText is empty or uninformative, return "none".
</instructions>

<output>
Respond ONLY with this XML structure:
<response>
  <match>connectionId if available, otherwise the literal string "partners+secret"</match>
  <partners>comma-separated partners of the matched connection or empty if none</partners>
  <secret>the candidate secret you matched against (empty if none)</secret>
  <decision>"matched" or "none"</decision>
  <reason>very brief justification (one short sentence)</reason>
  <confidence>high|medium|low</confidence>
  <raw>the exact JSON object of the matched candidate or empty</raw>
}</response>

Do not include any other text.
</output>`;

export const dailyPlanningTemplate = `<task>Generate research-based daily plans and check-in messages for two people in a relationship, using psychological frameworks and evidence-based interventions to create personalized connection experiences based on today's theme and their current context.</task>

<research_frameworks>
**Core Psychological Models:**

**Gottman's Sound Relationship House Theory:**
- **Love Maps** (Foundation): Deep knowledge of partner's inner world - their stresses, joys, life dreams, values, and daily experiences. Research shows couples with detailed Love Maps navigate transitions 67% more successfully. Key questions: "What are your partner's current stressors?", "What are they looking forward to?", "What's their life dream?"
- **Fondness & Admiration**: Expressing respect and appreciation regularly. The 5:1 ratio principle - stable relationships have 5 positive interactions for every negative one. Masters of relationships scan for things to appreciate; disasters scan for mistakes. Daily practice: "What can I appreciate about my partner today?"
- **Turning Toward Bids**: Partners make "bids" for connection (verbal comments, gestures, looks, touches). Successful couples turn toward bids 86% of the time, failing couples only 33%. Types: humor bids, affection bids, support bids, attention bids. Response options: turning toward (engaging), turning away (ignoring), turning against (rejecting)
- **Positive Perspective**: Positive Sentiment Override (PSO) means neutral actions are seen positively. Negative Sentiment Override (NSO) means even positive actions are viewed suspiciously. PSO requires consistent positive interactions over time
- **Managing Conflict**: 69% of relationship problems are perpetual (unsolvable). Success comes from dialogue, not resolution. Soft startup formula: "I feel [emotion] about [specific situation] and I need [positive need]"
- **Making Life Dreams Come True**: Being each other's champion. Understanding deeper meaning behind positions. "What's the dream behind your position on this issue?"
- **Creating Shared Meaning**: Rituals of connection, shared goals, roles, symbols. Weekly/daily rituals predict relationship stability better than vacation frequency

**Attachment Theory in Adult Relationships:**
- **Secure (60%)**: Comfortable with intimacy and independence. Easy to get close to others, don't worry about abandonment. Intervention response: Standard approaches work well, can handle direct communication
- **Anxious-Preoccupied (20%)**: Crave intimacy but fear abandonment. Seek constant reassurance, highly sensitive to partner's moods. Need: Consistent reassurance, predictability, validation. Triggered by: Distance, ambiguity, delayed responses
- **Dismissive-Avoidant (15%)**: Prioritize independence over intimacy. Uncomfortable with closeness, minimize emotional expression. Need: Autonomy respect, gradual approach, logical framing. Triggered by: Emotional intensity, dependency, loss of control
- **Fearful-Avoidant/Disorganized (5%)**: Want close relationships but fear getting hurt. Push-pull dynamic. Need: Safety, patience, professional support. Triggered by: Intimacy and distance both

**Intimacy Process Model (Reis & Shaver):**
Process flow: Person A discloses → Person B perceives disclosure → Person B responds → Person A perceives response as understanding/validating/caring → Both experience increased intimacy. Key finding: Perceived partner responsiveness matters more than actual response quality. Components of responsiveness: Understanding (accurate knowledge), Validation (acceptance), Care (expressing concern)

**Self-Expansion Theory (Aron & Aron):**
People seek to expand their sense of self through relationships. Novel, challenging activities together activate same brain regions as early romance. Even 7-minute novel activities increase relationship quality. Expansion activities must be: Arousing (physiologically activating), Novel (new/unusual), Challenging (requires effort). Examples: Learning new skill together, exploring new places, tackling challenges

**Emotionally Focused Therapy (EFT) - Sue Johnson:**
- **Stage 1 - De-escalation**: Identify negative cycle (pursue-withdraw, blame-defend, withdraw-withdraw). Map each partner's position in cycle. Access unacknowledged emotions (fear under anger, sadness under criticism)
- **Stage 2 - Restructuring**: Express attachment needs directly ("I need to know I matter to you"). Create corrective emotional experiences. Accept partner's new responses
- **Stage 3 - Consolidation**: Practice new patterns. Create new solutions to old problems. Build relationship resilience
Success rate: 70-73% of couples recover, 90% show improvement

**Active Constructive Responding (Gable):**
Four response styles to good news:
- **Active-Constructive** (relationship-building): "That's amazing! Tell me more! How did you feel?" Enthusiastic, asks questions, maintains eye contact
- **Passive-Constructive** (relationship-neutral): "That's nice, dear." Understated support, minimal energy
- **Active-Destructive** (relationship-harming): "That sounds stressful. Are you sure you can handle it?" Finds problems, steals joy
- **Passive-Destructive** (relationship-harming): "Oh, guess what happened to me..." Ignores, hijacks conversation
Only Active-Constructive builds relationships. Effect size: d=0.48 for relationship satisfaction

**Social Penetration Theory (Altman & Taylor):**
Relationships develop through gradual, reciprocal self-disclosure. Breadth (variety of topics) and depth (intimacy level) both matter. Stages:
1. **Orientation**: Small talk, public information
2. **Exploratory**: Opinions on public matters, some personal information
3. **Affective**: Private matters, personal opinions, moderate intimacy
4. **Stable**: Core values, deep fears, high intimacy
5. **Depenetration**: (if relationship declining) Withdrawal of disclosure

**36 Questions Protocol (Arthur Aron):**
Creates intimacy through escalating self-disclosure in 45 minutes. Three sets of 12 questions progressing from surface to deeply personal. Mechanism: Sustained eye contact + reciprocal vulnerability + escalating intimacy. Success rate: 30% of participants reported feeling closer than any other relationship. Key element: 4-minute eye contact at end activates attachment system

**Nonviolent Communication (Marshall Rosenberg):**
Four components for expressing needs without triggering defensiveness:
1. **Observation**: "When I see/hear..." (specific, without evaluation)
2. **Feeling**: "I feel..." (emotion, not thought)
3. **Need**: "Because I need..." (universal human need)
4. **Request**: "Would you be willing to...?" (specific, doable, positive language)
Example: "When I see you on your phone during dinner (observation), I feel lonely (feeling) because I need connection (need). Would you be willing to have phone-free dinners? (request)"

**Gottman's Four Horsemen (Relationship Destroyers):**
1. **Criticism**: Attacking partner's character ("You're so selfish")
   - Antidote: Gentle startup, use "I" statements
2. **Contempt**: Superiority, sarcasm, eye-rolling (strongest divorce predictor)
   - Antidote: Build culture of appreciation
3. **Defensiveness**: Playing victim, counter-attacking
   - Antidote: Take responsibility for even small part
4. **Stonewalling**: Withdrawing, shutting down (85% done by men)
   - Antidote: Self-soothing, breaks when flooded

**Imago Relationship Therapy (Harville Hendrix):**
Based on unconscious partner selection to heal childhood wounds. Dialogue process:
1. **Mirroring**: "Let me see if I got it..." (accurate reflection)
2. **Validation**: "That makes sense because..." (logical understanding)
3. **Empathy**: "I imagine you might be feeling..." (emotional attunement)
Purpose: Create safety for vulnerability, ensure both feel heard before problem-solving
</research_frameworks>

<intervention_guidelines>
**Attachment-Specific Intervention Strategies:**

**For Secure Attachment (Baseline Approaches):**
- Direct communication without excessive scaffolding
- Balance individual and couple activities
- Standard vulnerability progression
- Can handle partner's difficult emotions
- Typical interventions work as designed
- Focus on growth and expansion
- Example opening: "How are you feeling about your relationship today?"

**For Anxious Attachment (Reassurance & Consistency):**
- **Morning reassurance ritual**: Start with affirmation of relationship security
- **Response time expectations**: Set clear communication patterns to reduce anxiety
- **Self-soothing toolkit**: 
  - STOP technique: Sense anxiety, Take breath, Observe evidence of love, Pause before reaching
  - 3-3-3 grounding: Name 3 things you see, hear, feel
  - Partner photo meditation: Look at happy photos when anxious
- **Reframing thoughts**: "Is this intuition or anxiety?" distinction
- **Validation language**: "Your feelings make complete sense," "I understand why you'd feel that way"
- **Abandonment fear work**: Create "evidence of love" list, reference consistent behaviors
- **Connection intervals**: Shorter gaps between check-ins (every 2-3 hours vs daily)
- **Example interventions**: Gratitude journaling focused on partner's consistent behaviors, creating "relationship security anchors"

**For Avoidant Attachment (Autonomy & Structure):**
- **Time-bounded exercises**: "This will take exactly 5 minutes" (reduces overwhelm)
- **Logical framing**: Present emotional work as experiments or data collection
- **Choice emphasis**: "You might consider..." rather than "You should..."
- **Independence validation**: "Your need for space is healthy and normal"
- **Gradual vulnerability ladder**:
  - Level 1: Facts and observations
  - Level 2: Opinions and preferences  
  - Level 3: Past experiences
  - Level 4: Current challenges
  - Level 5: Emotions and needs
- **Compartmentalization bridges**: Help transition between work/relationship modes
- **Written options**: Sometimes writing feels safer than verbal expression
- **Efficiency arguments**: "5 minutes of connection saves hours of relationship stress"
- **Example interventions**: Structured check-ins with clear agendas, emotion wheel identification, cost-benefit analysis of vulnerability

**For Disorganized Attachment (Safety & Stabilization):**
- **Predictability focus**: Same time, same structure daily
- **Safety establishment**: Always start with "You're safe here"
- **Smaller steps**: Break interventions into micro-steps
- **Trauma-informed approach**: Watch for triggers, provide grounding
- **Professional coordination**: Regular check on therapy/support
- **Both/and framing**: "You can want closeness AND need space"
- **Window of tolerance work**: Stay within emotional capacity
- **Co-regulation emphasis**: Model calm, steady presence

**Personality-Based Adaptations:**

**High Openness (Creative & Abstract):**
- Metaphorical exploration: "If your relationship were a garden..."
- Creative exercises: Art, music, poetry for expression
- Novel approaches: Try unusual interventions
- Philosophical discussions: Explore meaning and purpose
- Flexibility in structure: Allow tangents and exploration
- Example: "What new discovery about your partner surprised you this week?"

**High Conscientiousness (Structured & Goal-Oriented):**
- Clear agendas: "Today we'll cover three things..."
- Progress tracking: Measurable relationship goals
- Scheduled activities: Same time daily/weekly
- Homework assignments: Specific tasks between sessions
- Achievement focus: Celebrate completed exercises
- Example: "Let's review your relationship goals and track progress"

**High Extraversion (Social & Energetic):**
- Verbal processing: Talk through feelings
- Social activities: Double dates, group events
- Energy matching: Enthusiastic, animated approach
- External processing: Share with friends (appropriately)
- Interactive exercises: Role-play, active games
- Example: "Tell me about the best social experience you shared recently!"

**High Agreeableness (Harmonious & Giving):**
- Gentle challenges: "What would happen if you expressed your need?"
- Balance focus: Their needs matter too
- Conflict normalization: "Disagreement can be healthy"
- Boundary work: OK to say no sometimes
- Self-advocacy: Practice asking for things
- Example: "What's one thing YOU need today (not what your partner needs)?"

**High Neuroticism (Emotionally Reactive):**
- Emotion regulation first: Calm before exploration
- Anxiety management: Breathing, grounding techniques
- Validation heavy: Frequent reassurance
- Catastrophizing interruption: "What's most likely?"
- Stability emphasis: Consistent, predictable approach
- Shorter sessions: Prevent emotional flooding
- Example: "Let's start with three deep breaths together"

**Stage-Specific Interventions:**

**New Relationships (0-6 months):**
- **Focus**: Building secure foundation, healthy patterns
- **Interventions**: 
  - Getting-to-know-you questions (lighter 36 Questions)
  - Love Map building exercises
  - Communication style discovery
  - Attachment style awareness (gentle introduction)
- **Vulnerability level**: Surface to moderate
- **Frequency**: Daily light touch-points
- **Warning signs to address**: Love bombing, excessive merging, ignoring red flags

**Developing Relationships (6-18 months):**
- **Focus**: Deepening intimacy, navigating first conflicts
- **Interventions**:
  - Conflict resolution skills (soft startup practice)
  - Values exploration and alignment
  - Family-of-origin discussions
  - Future visioning together
- **Vulnerability level**: Moderate to deep
- **Frequency**: 3-4 structured conversations weekly
- **Key transitions**: Meeting families, moving in, "I love you"

**Established Relationships (1.5-5 years):**
- **Focus**: Maintaining passion, preventing stagnation
- **Interventions**:
  - Novel experience planning (monthly adventures)
  - Intimacy revival exercises
  - Role flexibility exploration
  - Life dream integration
- **Vulnerability level**: Deep, with focus on unexplored areas
- **Frequency**: Weekly deep dives, daily brief connections
- **Common challenges**: Habituation, decreased sex, work-life balance

**Long-term Relationships (5+ years):**
- **Focus**: Renewal, managing perpetual problems
- **Interventions**:
  - Ritual renewal and creation
  - Gottman's Dreams Within Conflict
  - Legacy and meaning discussions
  - Appreciation archaeology (rediscovering early love)
- **Vulnerability level**: Core wounds and dreams
- **Frequency**: Biweekly deep work, daily rituals
- **Growth edges**: Accepting unsolvable problems, maintaining individuality

**Crisis Intervention Protocols:**

**Acute Conflict (Last 24 hours):**
- Emotional regulation first (both partners separately)
- Validate both experiences without taking sides
- Focus on understanding, not resolution
- Suggest 24-hour pause if needed
- Soft startup scripts for re-engagement

**Trust Breach (Discovered lie, boundary violation):**
- Acknowledge severity without minimizing
- Separate conversations initially
- Focus on betrayed partner's needs first
- Provide structure for disclosure if appropriate
- Professional referral if beyond coaching scope

**External Stressor (Job loss, illness, death):**
- Shift to support mode vs growth mode
- Simplify interventions to basic connection
- Focus on "we're a team" messaging
- Stress-reducing conversations (not problem-solving)
- Increase appreciation and gratitude work

**Communication Techniques by Context:**

**For Difficult Conversations:**
- **PREP Method**: Pause, Reflect, Empathize, Proceed
- **Temperature check**: "On a scale of 1-10, how activated are you?"
- **Time limits**: "Let's discuss for 20 minutes then take a break"
- **Speaker-listener technique**: One speaks, other only reflects back

**For Building Intimacy:**
- **Eye contact exercises**: 30 seconds building to 4 minutes
- **Synchronized breathing**: Match respiratory rhythms
- **Question depth progression**: Facts → Opinions → Emotions → Dreams
- **Touch exercises**: Non-sexual holding, massage, synchronized walking

**For Daily Connection:**
- **Stress-reducing conversation**: 20 minutes, no advice giving
- **Appreciation texts**: Specific, behavior-focused gratitude
- **Ritual creation**: Morning coffee, evening walk, bedtime gratitude
- **Bid awareness**: Notice and respond to connection attempts

**For Conflict Resolution:**
- **Repair attempts**: "Can we start over?", "I'm sorry, that came out wrong"
- **Dreams within conflict**: "What's the dream behind your position?"
- **Two-circle method**: Find overlap between different needs
- **Aftermath kit**: Process fight after emotions settle
</intervention_guidelines>

<context>
You are creating a personalized daily plan based on psychological research and the couple's specific context.

**Today's Theme:** {{dailyTheme}}

**Person 1 Information:**
Name: {{person1Name}}
User ID: {{person1UserId}}

Person 1 Self Memories:
{{person1PersonaMemories}}

Person 1's prespective on their relationship:
{{person1ConnectionMemories}}

Person 1 Previous Daily Plan:
{{person1PreviousPlan}}

Person 1 Recent Conversations (Last 24h):
{{person1RecentMessages}}

**Person 2 Information:**
Name: {{person2Name}}
User ID: {{person2UserId}}

Person 2 Self Memories:
{{person2PersonaMemories}}

Person 2's perspective on their relationship:
{{person2ConnectionMemories}}

Person 2 Previous Daily Plan:
{{person2PreviousPlan}}

Person 2 Recent Conversations (Last 24h):
{{person2RecentMessages}}

**Relationship Context:** {{sharedRelationshipContext}}
Current Date: {{currentDate}}
</context>

<instructions>
Create personalized daily plans that feel natural and engaging while incorporating research-based interventions:

1. **Theme-Aligned Framework Selection**:
   - Choose 1-2 specific research frameworks that match today's theme
   - Select interventions proven effective for their attachment styles
   - Match complexity to relationship stage and current capacity
   - Consider cultural context in intervention design

2. **Check-In Message Design**:
   - Reference something specific from last 24-48 hours
   - Use attachment-appropriate language (reassuring for anxious, autonomy-respecting for avoidant)
   - Create emotional safety through warm, non-judgmental tone
   - Match their personality style (structured for conscientious, flexible for open)
   - End with an engaging question that invites sharing

3. **Daily Plan Structure** (follows structured narrative format):
   
   **Format: # Important Task: Follow Daily Plan Narrative Below**
   - Start with clear task headline and theme
   - Single focused goal per day (not multiple frameworks)
   - Brief context referencing yesterday's progress
   
   **Phase 1: Opening Reflection (Adaptive)**
   - Acknowledge their current emotional state and previous progress
   - Introduce today's single focus area
   - Gauge engagement level and readiness
   - STOP if user seems overwhelmed or gives minimal responses
   
   **Phase 2: Focused Exploration (1-3 messages max)**
   - Explore ONE main concept or insight
   - Use their recent examples to illustrate
   - STOP exploring once user shares insight or makes connection
   - If user says "I'm not sure" twice, move to application phase
   
   **Phase 3: Practical Application (Move here quickly)**
   - Translate any insight into specific action for today
   - Create manageable commitment
   - Focus on "what will you do?" not "how do you feel about it?"
   
   **Phase 4: Activity Selection**
   - Offer 2-3 specific activity options
   - Let user choose or agent selects based on their responses
   - Focus on small, sustainable actions
   
   **Natural Conversation Ending (Any time after Phase 3)**
   - Celebrate progress made (however small)
   - Reference future check-in
   - End gracefully when natural stopping point reached

4. **Conversation Management**:
   - **Focus Limitation**: Daily plans focus on ONE primary goal. Only introduce secondary elements if user shows high engagement
   - **Length Monitoring**: After 10 messages, begin wrapping up unless user is highly engaged. Conclude gracefully after 6-8 messages if disengagement detected
   - **Disengagement Signals**: Watch for one-word responses, mentions of being 'busy'/'tired', topic changes, delayed responses
   - **Natural Endings**: Always include clear ending phase that celebrates progress and mentions future check-in
   - **CRITICAL: Anti-Repetition Rules**:
     * NEVER ask variations of the same question ("How does this make you feel?" → "What does this tell you about?" → "How does this affect your appreciation?")
     * Once user answers a question about feelings/appreciation/understanding, MOVE FORWARD to a new topic
     * Recognize when sufficient exploration has occurred - accept simple answers as complete
     * If user says "I'm not sure" or gives brief responses, don't push for deeper analysis
     * Watch for circular patterns: asking about feelings → asking about impact → asking about meaning → asking about feelings again
     * When user provides an insight, acknowledge it and SHIFT to practical application or new focus area
   - **Topic Completion Signals**: Move forward when user has:
     * Shared a specific example or insight
     * Expressed an emotion or realization
     * Made a connection or understanding
     * Indicated they've explored the topic sufficiently
   - **Forward Progression**: After each user response, ask yourself: "Have I already explored this angle? Can I move to action/application/new topic?"
   
5. **Responsive Adaptations**:
   - **If stressed/overwhelmed**: Simplify to single appreciation exercise
   - **If engaged/energetic**: Explore deeper, but stay within single focus theme  
   - **If resistant**: Conclude early with encouragement to try tomorrow
   - **If celebrating**: Amplify positive but maintain conversation boundaries

6. **Cross-Partner Synergy** (coordinate without revealing):
   - Create complementary exercises that work together
   - Time suggestions to align with partner's availability
   - Build toward shared evening or weekend activity
   - Foster mutual discovery of needs and desires

7. **Optimal Check-In Timing Analysis**:
   - Review message timestamps in recent conversations to identify peak activity hours
   - Consider work schedule patterns and daily routines from context
   - Match check-in timing to message content (morning motivation at 7-9 AM, work support at 10-11 AM, evening reflection at 17-19 PM)
   - Account for response patterns (immediate vs delayed responses indicate availability)
   - Look for timezone indicators in conversation history
   - Default to 11 UTC (mid-morning globally) if patterns are unclear
   - Output optimal time as UTC hour (0-23) to avoid timezone confusion

**Quality Markers:**
- Follows "Important Task" headline format with clear single focus theme
- Uses adaptive phase structure that moves forward based on user responses
- Focuses on ONE primary goal per day (not multiple frameworks)  
- Includes conversation length management and natural stopping points
- Avoids repetitive questioning loops (asking same thing in different ways)
- Provides natural ending that celebrates progress and mentions future check-in
- Monitors engagement signals and adapts accordingly
- Uses specific details from their context (not generic)
- Incorporates research-based technique within single focus theme
- Provides concrete, doable action for today
- Respects their attachment style and personality
- Creates natural opportunity for partner connection
- Feels warm, personal, and supportive

**Anti-Pattern Examples (What NOT to do):**
- ❌ User: "I appreciate him" → Agent: "How does this make you feel?" → User: "Good" → Agent: "What does this tell you about your connection?"
- ❌ Asking 3+ variations of the same appreciation/feeling question in one conversation
- ❌ Pushing for deeper meaning when user gives simple, complete answers
- ❌ Continuing to explore when user says "I'm not sure" or gives one-word responses
- ✅ User: "I appreciate him" → Agent: "That's wonderful. What's one way you might show that appreciation today?"
</instructions>

<keys>
"person1Plan" should be the detailed plan of the narrative flow and suggestions for person 1.
"person1CheckIn" should be the message which Deepen-Connection wish to send to person 1 to start the conversation.
"person1CheckInTimeUTC" should be the optimal UTC hour (0-23) to send the check-in message to person 1 based on their activity patterns and message content.
"person2Plan" should be the detailed plan of the narrative flow and suggestions for person 2.
"person2CheckIn" should be the message which Deepen-Connection wish to send to person 2 to start the conversation.
"person2CheckInTimeUTC" should be the optimal UTC hour (0-23) to send the check-in message to person 2 based on their activity patterns and message content.
</keys>

<example>
**Context:**
- Today's Theme: Emotional Connection Thursday
- Person 1 (Sarah): Anxious attachment, high agreeableness, feeling disconnected, mentioned missing quality time
- Person 2 (Michael): Avoidant attachment, high conscientiousness, work-stressed, tends to withdraw
- Relationship Stage: 14 months (Established)
- Current Dynamics: Pursue-withdraw pattern emerging
- Available Time: Both have evening free after 7pm

<response>
    <person1Plan># Important Task: Follow Daily Plan Narrative Below
Building Trust Through the Pause-Before-Pursue Practice

You're continuing yesterday's conversation with Sarah about feeling disconnected when Michael is stressed. She expressed awareness of her anxious attachment patterns. Today's single focus: mastering the art of self-soothing before reaching for connection.

## Today's Narrative Journey

### Opening Reflection
Acknowledge her insight yesterday about sensing changes in relationships - this is actually a superpower of anxious attachment. Today we'll transform that sensitivity into secure connection.

### Core Conversation Flow

#### Phase 1: Celebrating Your Relationship Radar (Opening - 1-2 messages)
- Validate that sensing disconnection is a strength, not neediness
- Ask what specifically she noticed about Michael's stress pattern
- Once she shares an observation, MOVE IMMEDIATELY to the concept phase
- Don't keep exploring feelings - acknowledge and progress

#### Phase 2: The Pause-Before-Pursue Concept (Quick Introduction - 1-2 messages max)
- Introduce the idea of creating space between feeling and responding
- Explain how this actually increases connection success
- If she shows understanding or interest, MOVE to practical application
- Don't ask multiple variations of "how does this feel?" or "what do you think?"

#### Phase 3: Creating Today's Practice (Focus Here - Move Quickly)
- Help her identify ONE specific pursue urge with Michael
- Choose ONE specific self-soothing action for today
- Focus on "what will you do?" not "how does this make you feel?"
- This is where most conversation time should be spent

#### Phase 4: Personalized Activity (Choose ONE based on engagement)
1. **The Three-Breath Reset**: When urge arises, take three deep breaths and ask "Is this urgent or anxiety?"
2. **The Self-Care First**: Do one nurturing activity (tea, walk, music) before reaching out
3. **The Soft Approach**: After self-soothing, reach out with "I'm thinking of you" instead of "What's wrong?"

### Natural Conversation Ending (After choosing activity)
Celebrate her willingness to try a new approach. Remind her that every pause builds security. Let her know we'll check in tomorrow to see how the practice went. End with confidence in her ability to create the connection she wants.

**Anti-Loop Reminders for Agent:**
- Don't ask "How does this make you feel about Michael?" after she chooses an activity
- Don't circle back to "What does this tell you about your relationship?" 
- Once she commits to a self-soothing practice, celebrate and wrap up
- Focus on action, not endless emotional processing

Remember: This is about helping Sarah channel her natural sensitivity into actions that invite Michael closer rather than triggering his withdrawal.</person1Plan>
    
    <person1CheckIn>Hi Sarah 💛 I've been thinking about what you shared yesterday about missing quality time with Michael. It sounds like the work stress is creating some distance between you two. How are you feeling about your connection today?</person1CheckIn>
    
    <person2Plan># Important Task: Follow Daily Plan Narrative Below
Building Connection Through Micro-Signals During Work Stress

You're continuing yesterday's conversation with Michael about maintaining connection while managing deadline pressure. He acknowledged that Sarah senses his withdrawal but wants to stay focused on work. Today's single focus: mastering 5-second connection signals that actually improve work focus.

## Today's Narrative Journey

### Opening Reflection
Acknowledge his awareness that work stress affects the relationship. His desire to manage both well shows his commitment to Sarah. Today we'll make connection a productivity tool, not a distraction.

### Core Conversation Flow

#### Phase 1: Reframing Connection as Efficiency (Opening - 1-2 messages)
- Validate that compartmentalizing is a strength during deadlines
- Present how relationship uncertainty creates background mental load
- Once he shows interest or agreement, MOVE to the micro-signal concept
- Don't keep exploring his feelings about work stress

#### Phase 2: The Micro-Signal Concept (Quick Introduction - 1-2 messages max)
- Introduce the idea of 5-second connection investments  
- Explain how brief signals prevent larger relationship fires
- If he shows understanding, MOVE immediately to practical application
- Avoid asking "How does this feel?" or "What do you think about this approach?"

#### Phase 3: Creating Today's Micro-Practice (Focus Here - Move Quickly to Action)
- Help him choose ONE specific micro-signal to send today
- Make it specific: what, when, how long
- Focus on logistics and implementation, not emotional processing
- This is where most conversation time should be spent

#### Phase 4: Personalized Activity (Choose ONE based on engagement)
1. **The 2PM Thinking-of-You**: Send simple "thinking of you" text at 2pm during natural break
2. **The Coffee Signal**: Send coffee emoji when taking afternoon coffee break (3 seconds)
3. **The Transition Text**: "Wrapping up work stuff, looking forward to seeing you" before heading home

### Natural Conversation Ending (After choosing micro-signal)
Celebrate his willingness to experiment with proactive connection. Remind him that 5 seconds now prevents 50-minute relationship conversations later. Let him know we'll check in tomorrow to see how the micro-signal worked. End with confidence in his ability to optimize both work and relationship.

**Anti-Loop Reminders for Agent:**
- Don't ask "How does this make you feel about connecting with Sarah?" after he chooses a signal
- Don't circle back to "What does this tell you about your relationship priorities?"
- Once he commits to a specific micro-signal, celebrate and wrap up
- Focus on implementation details, not emotional exploration

Remember: This is about helping Michael use his systematic nature to create the security Sarah needs while maintaining his work effectiveness.</person2Plan>
    
    <person2CheckIn>Hey Michael - I know you've got that deadline pressure. Quick thought: Relationship uncertainty can actually drain focus like background apps on your phone. What if we found a 2-minute way to close those tabs so you can fully concentrate?</person2CheckIn>
    
    <person1CheckInTimeUTC>14</person1CheckInTimeUTC>
    <person2CheckInTimeUTC>10</person2CheckInTimeUTC>
</response>
</example>

<o>
Do NOT include any thinking, reasoning, or explanations in your response. 
Go directly to the XML response format without any preamble.

Respond using XML format like this:
<response>
    <person1Plan>Combine the conversation flow plan and personalized suggestions into a cohesive daily narrative plan with 3-4 specific elements that build on their context for person 1</person1Plan>
    <person1CheckIn>A warm, personalized opening question that builds on their recent conversations and creates engagement for the day for person 1</person1CheckIn>
    <person1CheckInTimeUTC>11</person1CheckInTimeUTC>
    <person2Plan>Combine the conversation flow plan and personalized suggestions into a cohesive daily narrative plan with 3-4 specific elements that build on their context for person 2</person2Plan>
    <person2CheckIn>A warm, personalized opening question that builds on their recent conversations and creates engagement for the day for person 2</person2CheckIn>
    <person2CheckInTimeUTC>11</person2CheckInTimeUTC>
</response>

IMPORTANT: Your response must ONLY contain the <response></response> XML block above. Do not include any text, thinking, or reasoning before or after this XML block. Start your response immediately with <response> and end with </response>.
</o>`;

export const relationshipProfilingTemplate = `<task>Analyze conversation histories between two partners and their AI to extract key relationship context information.</task>

<extraction_guidelines>
**Relationship Stage Classification:**
- Dating: Together but living separately, not engaged
- Moved In: Living together but not engaged
- Engaged: Committed to marriage, planning wedding
- Married: Legally married or in marriage-equivalent partnership
- Separated: Taking break or living apart after being together
Always make best guess based on available clues (intimacy level, shared responsibilities, future plans, how they refer to each other)

**Relationship Length:**
- Convert to months (e.g., "2 years" = 24 months, "year and a half" = 18 months)
- Look for: "been together for...", "our anniversary", "when we first met"
- If vague ("few months"), estimate (3-4 months)
- If multiple milestones, use start of romantic relationship

**Current Dynamics:**
- Primary pattern: supportive, distant, conflicted, passionate, stable, strained
- Interaction style: pursue-withdraw, blame-defend, withdraw-withdraw, collaborative
- Recent emotional climate: connected, disconnected, tense, warm, volatile

**Recent Patterns:**
- Changes in last 2-4 weeks: communication, intimacy, conflict, routines
- Recurring behaviors or issues
- Quality of interactions

**Active Challenges:**
- Current relationship stressors
- External pressures (work, family, health, financial)
- Unresolved conflicts or tensions

**Shared Goals:**
- Explicit mutual objectives
- Future plans mentioned by both
- What they're working toward together

**Cultural Context:**
- Location, religion, ethnicity if mentioned
- Family-of-origin influences
- Different cultural backgrounds or values
</extraction_guidelines>

<input>
**Partner 1 Conversation History:**
{{partner1ConversationHistory}}

**Partner 2 Conversation History:**
{{partner2ConversationHistory}}
</input>

<instructions>
1. Read both conversation histories
2. Extract available information for each category
3. Only include fields where information is found or can be reasonably inferred
4. Always make a guess for relationshipStage based on context clues
5. Convert all time references to months for relationshipLength
6. Be concise and specific
7. Focus on facts and patterns from the conversations
</instructions>

<examples>
**Example 1:**
Partner 1: "My girlfriend and I have been together 8 months. Just moved in together last month. It's been hard with her always wanting to talk when I need space after work."

Partner 2: "Since moving in with James, he withdraws when stressed. We want to get married someday but not rushing."

Output:
<relationshipStage>Moved In</relationshipStage>
<relationshipLength>8</relationshipLength>
<currentDynamics>Pursue-withdraw pattern, Sarah seeking connection, James needing space</currentDynamics>
<recentPatterns>Post-move adjustment stress, James withdrawing after work, Sarah pursuing conversations</recentPatterns>
<activeChallenges>Cohabitation adjustment, different stress responses</activeChallenges>
<sharedGoals>Marriage in future</sharedGoals>

**Example 2:**
Partner 1: "My husband has been so distant lately. We've been married for 3 years."

Partner 2: "Work has been overwhelming. I know I haven't been present for Amy."

Output:
<relationshipStage>Married</relationshipStage>
<relationshipLength>36</relationshipLength>
<currentDynamics>Emotional distance, work stress affecting connection</currentDynamics>
<activeChallenges>Work-life balance, emotional disconnection</activeChallenges>

**Example 3:**
Partner 1: "We've been dating a few months. I really like her but we haven't said I love you yet."

Partner 2: "Things are going well with Tom. We see each other 2-3 times a week."

Output:
<relationshipStage>Dating</relationshipStage>
<relationshipLength>3</relationshipLength>
<currentDynamics>Early dating, building connection, seeing each other regularly</currentDynamics>
<recentPatterns>Regular dates 2-3 times per week</recentPatterns>
</examples>

<keys>
"relationshipStage" should be one of: Dating, Moved In, Engaged, Married, or Separated
"relationshipLength" should be a number in months
"currentDynamics" should be a brief description of interaction pattern
"recentPatterns" should describe recent 2-4 week patterns
"activeChallenges" should describe current issues and stressors
"sharedGoals" should describe mutual objectives
"culturalContext" should describe cultural/family factors if mentioned
</keys>

<o>
Do NOT include any thinking, reasoning, or explanations in your response. 
Go directly to the XML response format without any preamble.

Respond using XML format like this:
<response>
    <relationshipStage>Dating</relationshipStage>
    <relationshipLength>18</relationshipLength>
    <currentDynamics>brief description of interaction pattern</currentDynamics>
    <recentPatterns>recent patterns if observed/recentPatterns>
    <activeChallenges>current issues and stressors if mentioned</activeChallenges>
    <sharedGoals>mutual objectives if mentioned</sharedGoals>
    <culturalContext>culturally they are from different cultures, one was born in south europe and the other in asia, family dynamic is different</culturalContext>
</response>

IMPORTANT: Your response must ONLY contain the <response></response> XML block above. Do not include any text, thinking, or reasoning before or after this XML block. Start your response immediately with <response> and end with </response>.
</o>`;

export const weeklyPlanningTemplate = `<task>Generate a comprehensive weekly relationship enhancement plan that creates a structured sequence of daily themes and activities designed to strengthen relationship dynamics, incorporating psychological research and evidence-based interventions.</task>

<research_frameworks>
**Core Psychological Models:**

**Gottman's Sound Relationship House Theory:**
- **Love Maps** (Foundation): Deep knowledge of partner's inner world - their stresses, joys, life dreams, values, and daily experiences. Research shows couples with detailed Love Maps navigate transitions 67% more successfully. Key questions: "What are your partner's current stressors?", "What are they looking forward to?", "What's their life dream?"
- **Fondness & Admiration**: Expressing respect and appreciation regularly. The 5:1 ratio principle - stable relationships have 5 positive interactions for every negative one. Masters of relationships scan for things to appreciate; disasters scan for mistakes. Daily practice: "What can I appreciate about my partner today?"
- **Turning Toward Bids**: Partners make "bids" for connection (verbal comments, gestures, looks, touches). Successful couples turn toward bids 86% of the time, failing couples only 33%. Types: humor bids, affection bids, support bids, attention bids. Response options: turning toward (engaging), turning away (ignoring), turning against (rejecting)
- **Positive Perspective**: Positive Sentiment Override (PSO) means neutral actions are seen positively. Negative Sentiment Override (NSO) means even positive actions are viewed suspiciously. PSO requires consistent positive interactions over time
- **Managing Conflict**: 69% of relationship problems are perpetual (unsolvable). Success comes from dialogue, not resolution. Soft startup formula: "I feel [emotion] about [specific situation] and I need [positive need]"
- **Making Life Dreams Come True**: Being each other's champion. Understanding deeper meaning behind positions. "What's the dream behind your position on this issue?"
- **Creating Shared Meaning**: Rituals of connection, shared goals, roles, symbols. Weekly/daily rituals predict relationship stability better than vacation frequency

**Attachment Theory in Adult Relationships:**
- **Secure (60%)**: Comfortable with intimacy and independence. Easy to get close to others, don't worry about abandonment. Intervention response: Standard approaches work well, can handle direct communication
- **Anxious-Preoccupied (20%)**: Crave intimacy but fear abandonment. Seek constant reassurance, highly sensitive to partner's moods. Need: Consistent reassurance, predictability, validation. Triggered by: Distance, ambiguity, delayed responses
- **Dismissive-Avoidant (15%)**: Prioritize independence over intimacy. Uncomfortable with closeness, minimize emotional expression. Need: Autonomy respect, gradual approach, logical framing. Triggered by: Emotional intensity, dependency, loss of control
- **Fearful-Avoidant/Disorganized (5%)**: Want close relationships but fear getting hurt. Push-pull dynamic. Need: Safety, patience, professional support. Triggered by: Intimacy and distance both

**Self-Expansion Theory (Aron & Aron):**
People seek to expand their sense of self through relationships. Novel, challenging activities together activate same brain regions as early romance. Even 7-minute novel activities increase relationship quality. Expansion activities must be: Arousing (physiologically activating), Novel (new/unusual), Challenging (requires effort). Examples: Learning new skill together, exploring new places, tackling challenges

**Emotionally Focused Therapy (EFT) - Sue Johnson:**
- **Stage 1 - De-escalation**: Identify negative cycle (pursue-withdraw, blame-defend, withdraw-withdraw). Map each partner's position in cycle. Access unacknowledged emotions (fear under anger, sadness under criticism)
- **Stage 2 - Restructuring**: Express attachment needs directly ("I need to know I matter to you"). Create corrective emotional experiences. Accept partner's new responses
- **Stage 3 - Consolidation**: Practice new patterns. Create new solutions to old problems. Build relationship resilience
Success rate: 70-73% of couples recover, 90% show improvement

**Weekly Structure Theory (Ritualization Research):**
Creating predictable patterns of connection across 7-day cycles helps establish relationship security. Research by Dr. Terri Apter shows couples with weekly rituals report 40% higher satisfaction than those without structured time together. Key elements:
- **Monday Reset**: Transition from weekend to workweek, realignment of goals and support
- **Midweek Connection**: Combat the "Wednesday wall" where relationship attention typically drops
- **Weekend Planning**: Anticipation and shared experiences increase bonding hormones
- **Sunday Integration**: Process the week, prepare emotionally for the next cycle

**Circadian Relationship Rhythms:**
Research by Dr. Eli Finkel shows relationships have natural 7-day cycles:
- **Days 1-2**: High connection motivation, post-weekend bonding
- **Days 3-4**: Energy dip, increased potential for conflict
- **Days 5-7**: Recovery and preparation for renewal

**Progressive Intimacy Sequencing:**
Based on Social Penetration Theory - optimal vulnerability progression over 7 days:
1. **Surface sharing** (facts, events, observations)
2. **Opinion exchange** (preferences, judgments, light values)
3. **Experience sharing** (memories, stories, past events)
4. **Emotional revelation** (feelings, fears, hopes)
5. **Need expression** (attachment needs, desires, requests)
6. **Dream sharing** (future visions, deep aspirations)
7. **Integration** (synthesis of shared discoveries)
</research_frameworks>

<weekly_themes>
**7-Day Relationship Enhancement Sequence:**

**Monday - Fresh Start Monday (Realignment & Goal Setting)**
Theme: Beginning the week with shared intention and mutual support
Focus: Love Maps updates, weekly goal alignment, stress-reducing conversation
Psychological Basis: Gottman's Love Maps, Social Support Theory
Activities: Check-in on partner's week ahead, offer specific support, appreciate weekend together

**Tuesday - Gratitude Tuesday (Fondness & Admiration Building)**
Theme: Active appreciation and positive perspective strengthening  
Focus: Specific gratitude expressions, celebrating partner's qualities
Psychological Basis: Gottman's 5:1 ratio, Positive Psychology interventions
Activities: Gratitude journaling about partner, appreciation texts, acknowledging growth

**Wednesday - Connection Wednesday (Bids & Emotional Attunement)**
Theme: Midweek intimacy boost through active responsiveness
Focus: Turning toward bids, emotional check-ins, quality time creation
Psychological Basis: Gottman's Bid Theory, Attachment Security maintenance
Activities: Dedicated phone-free time, emotion sharing, active listening practice

**Thursday - Growth Thursday (Self-Expansion & Novel Experiences)**
Theme: Trying new things together, learning and exploring
Focus: Novel activities, learning experiences, stepping outside comfort zones
Psychological Basis: Aron's Self-Expansion Model, Novelty-seeking research
Activities: New recipe, different conversation topics, mini-adventures, skill sharing

**Friday - Intimacy Friday (Vulnerability & Deep Connection)**
Theme: Deeper emotional and physical intimacy
Focus: Vulnerability sharing, physical affection, intimate conversation
Psychological Basis: Social Penetration Theory, Intimacy Process Model
Activities: 36 Questions subset, massage/touch, sharing fears or dreams

**Saturday - Adventure Saturday (Shared Experiences & Fun)**
Theme: Creating positive shared memories through enjoyable activities
Focus: Fun, laughter, shared adventures (big or small)
Psychological Basis: Shared Experience theory, Positive Emotion Broadening
Activities: Date activities, exploring together, trying something new, playfulness

**Sunday - Reflection Sunday (Integration & Future Visioning)**
Theme: Processing the week and setting intentions for continued growth
Focus: Relationship reflection, conflict resolution if needed, planning ahead
Psychological Basis: Reflective Functioning, Meaning-Making theory
Activities: Week review, addressing any issues, appreciating growth, next week preview
</weekly_themes>

<context>
You are creating a comprehensive weekly relationship plan that sequences daily themes and activities to maximize relationship growth and connection.

**Couple Information:**
Names: {{person1Name}} and {{person2Name}}
User IDs: {{person1UserId}} and {{person2UserId}}

**Person 1 Context:**
{{person1PersonaMemories}}

Person 1's Relationship Perspective:
{{person1ConnectionMemories}}

Person 1 Recent Conversations (Last 48h):
{{person1RecentMessages}}

**Person 2 Context:**
{{person2PersonaMemories}}

Person 2's Relationship Perspective:
{{person2ConnectionMemories}}

Person 2 Recent Conversations (Last 48h):
{{person2RecentMessages}}

**Shared Relationship Context:** {{sharedRelationshipContext}}

**Previous Week's Plan:** {{previousWeekPlan}}

**Current Date:** {{currentDate}}
**Week Starting:** {{weekStartDate}}
</context>

<instructions>
Create a comprehensive weekly plan that:

1. **Analyzes Current Relationship State**:
   - Identify relationship stage, attachment styles, and current dynamics
   - Recognize strengths to build on and areas needing attention
   - Consider external stressors and couple's available time/energy
   - Note any recent conflicts or celebrations to address

2. **Designs Personalized Daily Themes**:
   - Select appropriate daily theme based on couple's needs and capacity
   - Adapt standard themes to their specific situation
   - Ensure progressive difficulty and emotional safety
   - Balance individual needs with relationship goals

3. **Creates Specific Daily Activities**:
   - Provide 2-3 concrete activity options for each day
   - Include time estimates and complexity levels
   - Offer alternatives for different energy levels or schedules
   - Connect activities to research-based relationship benefits

4. **Ensures Weekly Coherence**:
   - Build themes that complement and reinforce each other
   - Create momentum from Monday through Sunday
   - Plan for midweek energy dips and weekend opportunities
   - End with integration that sets up next week's success

5. **Provides Implementation Guidance**:
   - Suggest optimal timing for activities
   - Offer conversation starters and structure when needed
   - Include "backup plans" for difficult days
   - Address potential resistance or obstacles

**Quality Standards:**
- Uses specific details from their relationship context
- Incorporates at least 3 different psychological frameworks
- Provides concrete, doable activities for each day
- Respects both partners' attachment styles and personalities  
- Creates natural progression from simple to more vulnerable
- Feels personal, warm, and achievable rather than overwhelming
</instructions>

<keys>
"weekOverview" should be a paragraph summarizing the week's focus and how it addresses their specific relationship needs
"mondayTheme" should be the specific Monday theme and focus for this couple
"mondayActivities" should be 2-3 specific activity suggestions with time estimates
"tuesdayTheme" should be the specific Tuesday theme and focus for this couple
"tuesdayActivities" should be 2-3 specific activity suggestions with time estimates
"wednesdayTheme" should be the specific Wednesday theme and focus for this couple
"wednesdayActivities" should be 2-3 specific activity suggestions with time estimates
"thursdayTheme" should be the specific Thursday theme and focus for this couple
"thursdayActivities" should be 2-3 specific activity suggestions with time estimates
"fridayTheme" should be the specific Friday theme and focus for this couple
"fridayActivities" should be 2-3 specific activity suggestions with time estimates
"saturdayTheme" should be the specific Saturday theme and focus for this couple
"saturdayActivities" should be 2-3 specific activity suggestions with time estimates
"sundayTheme" should be the specific Sunday theme and focus for this couple
"sundayActivities" should be 2-3 specific activity suggestions with time estimates
"weeklyGoals" should be 2-3 specific relationship goals for this week
"successMetrics" should be concrete ways to measure if the week was successful
</keys>

<example>
**Context:**
- Person 1 (Sarah): Anxious attachment, feeling disconnected lately, works in marketing, loves trying new restaurants
- Person 2 (Michael): Avoidant attachment, stressed with work deadlines, engineer mindset, enjoys hiking
- Relationship Stage: Living together 8 months, recently some pursue-withdraw patterns
- Recent Context: Sarah mentioned feeling like ships passing in the night, Michael acknowledged being too focused on work project
- Current Date: Monday, January 15th
- Week Starting: January 15-21st

<response>
    <weekOverview>This week focuses on rebuilding connection through structured intimacy that respects Michael's need for autonomy while meeting Sarah's need for reassurance. We'll use a "gentle reconnection" approach that starts with small, non-threatening interactions and builds toward deeper intimacy by weekend. The plan specifically addresses the pursue-withdraw pattern by having Michael initiate several activities, giving Sarah the connection she craves while preserving his sense of choice and control.</weekOverview>
    
    <mondayTheme>Fresh Start Monday - "Project Us" Launch (20 minutes)</mondayTheme>
    <mondayActivities>1. **Weekly Planning Session** (10 min): Michael presents the week's "relationship project plan" to Sarah, framing connection as a shared goal they're both working toward. 2. **Stress-Reducing Check-in** (10 min): Each person shares their biggest work challenge this week and how their partner can best support them. 3. **Success Metrics Definition** (backup): Agree on one small daily check-in that feels manageable for both.</mondayActivities>
    
    <tuesdayTheme>Gratitude Tuesday - "Appreciation Data Points" (15 minutes)</tuesdayTheme>
    <tuesdayActivities>1. **Three Specific Appreciations** (5 min): Each person texts three specific things they appreciated about their partner from the weekend (focus on actions, not general qualities). 2. **Photo Gratitude** (5 min): Send a photo that reminded you of your partner during the day. 3. **Evening Acknowledgment** (5 min): Before bed, acknowledge one way your partner made your day better.</tuesdayActivities>
    
    <wednesdayTheme>Connection Wednesday - "Midweek Sync" (30 minutes)</wednesdayTheme>
    <wednesdayActivities>1. **Phone-Free Dinner** (25 min): Cook something simple together while music plays, focus on the process rather than deep conversation. 2. **Two-Question Check-in** (5 min): "How's your energy today?" and "What's one thing you're looking forward to?" 3. **Silent Connection** (backup): 10 minutes of same activity (reading nearby, each doing puzzles) without talking.</wednesdayActivities>
    
    <thursdayTheme>Growth Thursday - "Mini Adventure Planning" (25 minutes)</thursdayTheme>
    <thursdayActivities>1. **Saturday Adventure Research** (15 min): Look up three new restaurants Sarah's been wanting to try, let her choose while Michael researches hiking trails nearby. 2. **Skill Share** (10 min): Michael shows Sarah something technical he's working on, Sarah shows Michael a creative project or marketing strategy. 3. **Comfort Zone Stretch** (backup): Each person suggests something slightly new to try together this weekend.</thursdayActivities>
    
    <fridayTheme>Intimacy Friday - "Controlled Vulnerability" (35 minutes)</fridayTheme>
    <fridayActivities>1. **Structured Emotion Check** (15 min): Using feeling words wheel, each person identifies their primary emotion this week and why, then listens without fixing. 2. **Physical Affection Menu** (10 min): Create a list of 5 types of non-sexual touch you both enjoy, pick one to do now. 3. **One Fear, One Hope** (10 min): Share one small worry about the future and one thing you're excited about - partner only reflects, doesn't solve.</fridayActivities>
    
    <saturdayTheme>Adventure Saturday - "Sarah's Restaurant & Michael's Trail" (3-4 hours)</saturdayTheme>
    <saturdayActivities>1. **New Restaurant Experience** (90 min): Go to the restaurant Sarah chose, focus on trying new dishes and rating them together. 2. **Nature Connection** (90 min): Easy hike Michael selected, bring camera to document things that catch each person's attention. 3. **Adventure Debrief** (30 min): Over coffee, share favorite moments and what you learned about each other today.</saturdayActivities>
    
    <sundayTheme>Reflection Sunday - "Week Review & Next Week Preview" (40 minutes)</sundayTheme>
    <sundayActivities>1. **Week Appreciation** (15 min): Each person shares what they most appreciated about their partner this week and what felt different/better. 2. **Challenge Acknowledgment** (10 min): Briefly acknowledge any moments that were hard without trying to solve them now. 3. **Next Week Intention** (15 min): Look at calendars, identify potential stress points, and plan two small connection moments for the coming week.</sundayActivities>
    
    <weeklyGoals>1. Reduce pursue-withdraw pattern by having Michael initiate 5 out of 7 daily activities. 2. Increase Sarah's sense of relationship security through predictable daily connection points. 3. Build shared positive experiences that both partners can reference during stressful periods.</weeklyGoals>
    
    <successMetrics>Sarah reports feeling more confident that Michael is invested in the relationship. Michael feels like connecting doesn't require giving up his autonomy. Both partners complete at least 80% of suggested activities. They end Sunday feeling more like a team facing the world together.</successMetrics>
</response>
</example>

<o>
Do NOT include any thinking, reasoning, or explanations in your response. 
Go directly to the XML response format without any preamble.

Respond using XML format like this:
<response>
    <weekOverview>Paragraph summarizing the week's focus and approach for this specific couple</weekOverview>
    <mondayTheme>Specific Monday theme adapted for this couple</mondayTheme>
    <mondayActivities>2-3 specific activities with time estimates</mondayActivities>
    <tuesdayTheme>Specific Tuesday theme adapted for this couple</tuesdayTheme>
    <tuesdayActivities>2-3 specific activities with time estimates</tuesdayActivities>
    <wednesdayTheme>Specific Wednesday theme adapted for this couple</wednesdayTheme>
    <wednesdayActivities>2-3 specific activities with time estimates</wednesdayActivities>
    <thursdayTheme>Specific Thursday theme adapted for this couple</thursdayTheme>
    <thursdayActivities>2-3 specific activities with time estimates</thursdayActivities>
    <fridayTheme>Specific Friday theme adapted for this couple</fridayTheme>
    <fridayActivities>2-3 specific activities with time estimates</fridayActivities>
    <saturdayTheme>Specific Saturday theme adapted for this couple</saturdayTheme>
    <saturdayActivities>2-3 specific activities with time estimates</saturdayActivities>
    <sundayTheme>Specific Sunday theme adapted for this couple</sundayTheme>
    <sundayActivities>2-3 specific activities with time estimates</sundayActivities>
    <weeklyGoals>2-3 specific relationship goals for this week</weeklyGoals>
    <successMetrics>Concrete ways to measure if the week was successful</successMetrics>
</response>

IMPORTANT: Your response must ONLY contain the <response></response> XML block above. Do not include any text, thinking, or reasoning before or after this XML block. Start your response immediately with <response> and end with </response>.
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
Write a thought and plan for {{agentName}} and decide what actions to take. Also include the providers that {{agentName}} will use to have the right context for responding and acting, if any.


First, think about what you want to do next and plan your actions. Then, write the next message in following the onboarding narritive of Deepen-Connection and include the actions you plan to take.
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
    <actions>ACTION</actions>
    <text>Your response text here</text>
</response>

IMPORTANT: Your response must ONLY contain the <response></response> XML block above. Do not include any text, thinking, or reasoning before or after this XML block. Start your response immediately with <response> and end with </response>.
</o>`;

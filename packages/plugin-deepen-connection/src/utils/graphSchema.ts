/**
 * Graph Schema template for Deepen-Connection deepening human connections (Property Graph for Memgraph)
 *
 * IMPORTANT DATA TYPE AND FORMATTING RULES:
 * 1. All node property keys must be camelCase
 * 2. For enumerated values (gender, orientation, relationship types, etc.): use all lowercase
 *    Example: "male", "heterosexual", "friendship"
 * 3. For city names: use lowercase for consistent matching
 *    Example: "lisbon", "new york", "berlin"
 * 4. DATA TYPES MUST BE CONSISTENT:
 *    - isAvailable: Must be a boolean value (true/false), NOT a string ("True"/"False")
 *    - moodRating: Must be a number (7), NOT a string ("7")
 *    - timestamps: Must use ISO format
 *    - IDs: Use string format for all IDs
 */

export const GRAPH_SCHEMA = `
// Define Nodes
export const graph_schema = {
  // Person Node: Represents an individual.
  Person: {
    userId: "",               // UUID as unique identifier for the person (string)
    roomId: "",               // UUID as room/channel identifier where the person is active (string)
    name:"",              // string
    pronouns: ""          // Custom pronouns (they/them, etc.)
    updatedAt: "",        // Last updated timestamp in ISO format (string)
  },

 // Person Trait Nodes

  City:               { name: "" }, // e.g., "berlin"
  ContactInfo: {
    email: "",
    phoneNumber: "",
    telegramUsername:"",
    twitterUsername: "",
    whatsappNumber: ""
  },
  BirthInfo: {
    birthdate: "",     // YYYY-MM-DD
    birthCountry: "",
    ethnicity: ""
  },
  ExactLocation: {
    latitude: 0.0,
    longitude: 0.0
  },

  // Deepen-Connection Human Connection Node (Dyadic Context)
  HumanConnection: {
    partners: [],      // [person1 name, person2 name]
    secret: ""         // string, secret set by invitee that only the two knows
    updatedAt: ""     // ISO timestamp
  },

  // Deepen-Connection human connection trait nodes (Syadic Context)
  ConnectionProfile: {
    description: "",  // how they met, which stage of relationship, since when they met, relationship history, etc e.g. "Met at a hackathon in Sep 2023, early-stage work colleagues"
    updatedAt: ""     // ISO timestamp
  },
  ConnectionRoutine:{
    description:""    // shared rituals and habits doing together, from watching movies, doing sport, walking, etc e.g. watching movies, doing sport, walking, Weekly 5km run every Saturday morning
    updatedAt:""      // ISO timestamp
  },
  ConnectionGoal:{
    description:""    // shared goals, goals to achieve together, goals to achieve in the future, etc e.g. "Plan a trip to Japan together in 2025"
    updatedAt:""      // ISO timestamp
  },
  ConnectionExperience:{
    description:""    // shared experiences together, from going to places, attending events, etc e.g. "Attended three concert shows together"
    updatedAt:""      // ISO timestamp
  },
  ConnectionCommunication: {
    description: "",  // shared communication style and habits e.g. "Prefer texting; discuss difficult topics weekly"
    updatedAt: ""     // ISO timestamp
  },
  ConnectionEmotion: {
    description: "",  // shared feelings toward the relationship e.g. "Feel supported during stressful periods"
    updatedAt: ""     // ISO timestamp
  },


  // Subgraph Relationships
  LIVES_IN:             { source: "Person", target: "City",               properties: { updatedAt: "" } },
  HAS_CONTACT_INFO:     { source: "Person", target: "ContactInfo",        properties: { updatedAt: "" } },
  HAS_BIRTH_INFO:       { source: "Person", target: "BirthInfo",          properties: { updatedAt: "" } },
  HAS_LOCATION:         { source: "Person", target: "ExactLocation",      properties: { updatedAt: "" } },
  PARTICIPATES_IN:      { source: "Person", target: "HumanConnection",    properties: { role: "partner", updatedAt: "" } },

  // PEACOCK Persona Schema Relationships
  HAS_CHARACTERISTIC: { source: "Person", target: "Characteristic", properties: { updatedAt: "", evidence: "" } },
  HAS_ROUTINE: { source: "Person", target: "Routine", properties: { updatedAt: "", evidence: "" } },
  HAS_GOAL: { source: "Person", target: "Goal", properties: { updatedAt: "", evidence: "" } },
  HAS_EXPERIENCE: { source: "Person", target: "Experience", properties: { updatedAt: "", evidence: "" } },
  HAS_PERSONA_RELATIONSHIP: { source: "Person", target: "PersonaRelationship", properties: { updatedAt: "", evidence: "" } },
  HAS_DEMOGRAPHIC: { source: "Person", target: "Demographic", properties: { updatedAt: "", evidence: "" } },
  HAS_EMOTIONAL_STATE: { source: "Person", target: "EmotionalState", properties: { updatedAt: "", evidence: "" } },
  HAS_EMBEDDING: { source: "Person", target: "[Dimension]Embedding", properties: { updatedAt: "" } }

  // Deepen-Connection Human Connection Relationships
  HAS_CONNECTION_PROFILE: { source: "HumanConnection", target: "ConnectionProfile", properties: { updatedAt: "", evidence: "" } },
  HAS_CONNECTION_ROUTINE: { source: "HumanConnection", target: "ConnectionRoutine", properties: { updatedAt: "", evidence: "" } },
  HAS_CONNECTION_GOAL: { source: "HumanConnection", target: "ConnectionGoal", properties: { updatedAt: "", evidence: "" } },
  HAS_CONNECTION_EXPERIENCE: { source: "HumanConnection", target: "ConnectionExperience", properties: { updatedAt: "", evidence: "" } }
  HAS_CONNECTION_COMMUNICATION: { source: "HumanConnection", target: "ConnectionCommunication", properties: { updatedAt: "", evidence: "" } }
  HAS_CONNECTION_EMOTION: { source: "HumanConnection", target: "ConnectionEmotion", properties: { updatedAt: "", evidence: "" } }

  PRECIEVES_ROUTINE: {source: "Person", target: "ConnectionRoutine", properties: { updatedAt: "", evidence: "" } }
  PRECIEVES_GOAL: {source: "Person", target: "ConnectionGoal", properties: { updatedAt: "", evidence: "" } }
  PRECIEVES_EXPERIENCE: {source: "Person", target: "ConnectionExperience", properties: { updatedAt: "", evidence: "" } }
  PRECIEVES_COMMUNICATION: {source: "Person", target: "ConnectionCommunication", properties: { updatedAt: "", evidence: "" } }
  PRECIEVES_EMOTION: {source: "Person", target: "ConnectionEmotion", properties: { updatedAt: "", evidence: "" } }
};
`;

// PEACOCK Persona Schema: Defines the 5 core dimensions of a person's persona.
export const GRAPH_SCHEMA_PEACOCK = `
export const graph_schema_peacock = {
  // PEACOCK Nodes
  Demographic: {
    description: "",          // Static facts: age, gender, location, religion, environment (e.g., "lives in Berlin")
    interactivity: "",        // 'self' or 'relationship'
    distinctiveness: ""      // 'distinctive' or 'generic'
  },
  Characteristic: {
    description: "",          // An intrinsic trait or quality (e.g., "good at singing"), communication and attachment style in relationships
    interactivity: "",        // 'self' or 'relationship'
    distinctiveness: ""      // 'distinctive' or 'generic'
  },
  Routine: {
    description: "",          // A regular habit or behaviour (e.g., "writes songs regularly")
    interactivity: "",        // 'self' or 'relationship'
    distinctiveness: ""      // 'distinctive' or 'generic'
  },
  Goal: {
    description: "",          // An ambition or future plan (e.g., "wants to win a Grammy")
    interactivity: "",        // 'self' or 'relationship'
    distinctiveness: ""      // 'distinctive' or 'generic'
  },
  Experience: {
    description: "",          // A past event or experience (e.g., "studied music at college")
    interactivity: "",        // 'self' or 'relationship'
    distinctiveness: ""      // 'distinctive' or 'generic'
  },
  PersonaRelationship: {
    description: "",          // A social connection or interaction (e.g., "has many fans")
    interactivity: "relationship", // This is always 'relationship' by definition
    distinctiveness: ""      // 'distinctive' or 'generic'
  },
  EmotionalState: {
    description: "",          // Current feelings, mood, or pain points (e.g., "anxious about next concert")
    interactivity: "self",
    distinctiveness: ""      // 'distinctive' or 'generic'
  },
  // PEACOCK Embedding Nodes
  DemographicEmbedding: {
    text: "",           // The original text that was embedded
    vector: [],         // The embedding vector
    createdAt: ""       // ISO timestamp
  },
  CharacteristicEmbedding: {
    text: "", vector: [], createdAt: ""
  },
  RoutineEmbedding: {
    text: "", vector: [], createdAt: ""
  },
  GoalEmbedding: {
    text: "", vector: [], createdAt: ""
  },
  ExperienceEmbedding: {
    text: "", vector: [], createdAt: ""
  },
  PersonaRelationshipEmbedding: {
    text: "", vector: [], createdAt: ""
  },
  EmotionalStateEmbedding: {
    text: "", vector: [], createdAt: ""
  },

  // PEACOCK Relationships
  HAS_DEMOGRAPHIC: { source: "Person", target: "Demographic", properties: { updatedAt: "", evidence: "" } },
  HAS_EMOTIONAL_STATE: { source: "Person", target: "EmotionalState", properties: { updatedAt: "", evidence: "" } },
  HAS_CHARACTERISTIC: { source: "Person", target: "Characteristic", properties: { updatedAt: "", evidence: "" } },
  HAS_ROUTINE: { source: "Person", target: "Routine", properties: { updatedAt: "", evidence: "" } },
  HAS_GOAL: { source: "Person", target: "Goal", properties: { updatedAt: "", evidence: "" } },
  HAS_EXPERIENCE: { source: "Person", target: "Experience", properties: { updatedAt: "", evidence: "" } },
  HAS_PERSONA_RELATIONSHIP: { source: "Person", target: "PersonaRelationship", properties: { updatedAt: "", evidence: "" } },
  HAS_EMBEDDING: { source: "Person", target: "[Dimension]Embedding", properties: { updatedAt: "" } }
};
`;

import neo4j from 'neo4j-driver';

export interface MemgraphConfig {
  host?: string;
  port?: string;
  username?: string;
  password?: string;
}

export interface PersonNode {
  userId: string;
  roomId?: string;
  name?: string;
  pronouns?: string;
  updatedAt: string;
  // Optional fields that may exist when the Person node was created via the web app
  webId?: string;
  email?: string;
}

export interface HumanConnectionNode {
  partners: string[];
  secret: string;
  status?: string;
  updatedAt: string;
  // Optional id field used by the web app when creating connections
  connectionId?: string;
  createdAt?: string;
}

export class MemgraphService {
  private driver: any;
  private config: MemgraphConfig;

  constructor(config: MemgraphConfig = {}) {
    this.config = {
      host: config.host || '127.0.0.1',
      port: config.port || '7687',
      username: config.username || '',
      password: config.password || '',
    };
  }

  async connect(): Promise<void> {
    const uri = `bolt://${this.config.host}:${this.config.port}`;
    this.driver = neo4j.driver(
      uri,
      neo4j.auth.basic(this.config.username || '', this.config.password || '')
    );
  }

  async disconnect(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
    }
  }

  private async runQuery(query: string, parameters: any = {}): Promise<any> {
    if (!this.driver) {
      await this.connect();
    }

    const session = this.driver.session();
    try {
      const result = await session.run(query, parameters);
      return result;
    } finally {
      await session.close();
    }
  }

  /**
   * Check if a Person node exists for the given userId
   */
  async getPersonByUserId(userId: string): Promise<PersonNode | null> {
    const query = `
      MATCH (p:Person {userId: $userId})
      RETURN p
    `;

    const result = await this.runQuery(query, { userId });

    if (result.records.length === 0) {
      return null;
    }

    const personNode = result.records[0].get('p');
    return personNode.properties as PersonNode;
  }

  /**
   * Create a new Person node
   */
  async createPerson(
    userId: string,
    roomId?: string,
    name?: string,
    pronouns?: string
  ): Promise<PersonNode> {
    const updatedAt = new Date().toISOString();

    const query = `
      CREATE (p:Person {
        userId: $userId,
        roomId: $roomId,
        name: $name,
        pronouns: $pronouns,
        updatedAt: $updatedAt
      })
      RETURN p
    `;

    const result = await this.runQuery(query, {
      userId,
      roomId: roomId || '',
      name: name || '',
      pronouns: pronouns || '',
      updatedAt,
    });

    const personNode = result.records[0].get('p');
    return personNode.properties as PersonNode;
  }

  /**
   * Ensure a Person exists for the given userId and update basic fields if it already exists
   */
  async ensurePerson(
    userId: string,
    roomId?: string,
    name?: string,
    pronouns?: string
  ): Promise<PersonNode> {
    const updatedAt = new Date().toISOString();

    const query = `
      MERGE (p:Person {userId: $userId})
      SET p.roomId = COALESCE($roomId, p.roomId),
          p.name = COALESCE($name, p.name),
          p.pronouns = COALESCE($pronouns, p.pronouns),
          p.updatedAt = $updatedAt
      RETURN p
    `;

    const result = await this.runQuery(query, {
      userId,
      roomId: roomId || null,
      name: name || null,
      pronouns: pronouns || null,
      updatedAt,
    });

    const personNode = result.records[0].get('p');
    return personNode.properties as PersonNode;
  }

  /**
   * Check if a Person has any HumanConnection relationships
   */
  async hasHumanConnections(userId: string): Promise<boolean> {
    const query = `
      MATCH (p:Person {userId: $userId})-[:PARTICIPATES_IN]->(hc:HumanConnection)
      RETURN COUNT(hc) as connectionCount
    `;

    const result = await this.runQuery(query, { userId });
    const count = result.records[0].get('connectionCount').toNumber();

    return count > 0;
  }

  /**
   * Get all HumanConnections for a Person
   */
  async getHumanConnections(userId: string): Promise<HumanConnectionNode[]> {
    const query = `
      MATCH (p:Person {userId: $userId})-[:PARTICIPATES_IN]->(hc:HumanConnection)
      RETURN hc
    `;

    const result = await this.runQuery(query, { userId });

    return result.records.map((record: any) => {
      const connectionNode = record.get('hc');
      return connectionNode.properties as HumanConnectionNode;
    });
  }

  /**
   * Create a HumanConnection and link it to a Person
   */
  async createHumanConnection(
    userId: string,
    partnerName: string,
    secret: string
  ): Promise<HumanConnectionNode> {
    const updatedAt = new Date().toISOString();

    // Get the person's name first
    const person = await this.getPersonByUserId(userId);
    const userName = person?.name || 'User';

    const query = `
      MATCH (p:Person {userId: $userId})
      CREATE (hc:HumanConnection {
        partners: [$userName, $partnerName],
        secret: $secret,
        updatedAt: $updatedAt
      })
      CREATE (p)-[:PARTICIPATES_IN {role: "partner", updatedAt: $updatedAt}]->(hc)
      RETURN hc
    `;

    const result = await this.runQuery(query, {
      userId,
      userName,
      partnerName,
      secret,
      updatedAt,
    });

    const connectionNode = result.records[0].get('hc');
    return connectionNode.properties as HumanConnectionNode;
  }

  /**
   * Update Person's name
   */
  async updatePersonName(userId: string, name: string): Promise<PersonNode> {
    const updatedAt = new Date().toISOString();

    const query = `
      MATCH (p:Person {userId: $userId})
      SET p.name = $name, p.updatedAt = $updatedAt
      RETURN p
    `;

    const result = await this.runQuery(query, { userId, name, updatedAt });
    const personNode = result.records[0].get('p');
    return personNode.properties as PersonNode;
  }

  /**
   * Update Person's roomId
   */
  async updatePersonRoomId(userId: string, roomId: string): Promise<PersonNode> {
    const updatedAt = new Date().toISOString();

    const query = `
      MATCH (p:Person {userId: $userId})
      SET p.roomId = $roomId, p.updatedAt = $updatedAt
      RETURN p
    `;

    const result = await this.runQuery(query, { userId, roomId, updatedAt });
    const personNode = result.records[0].get('p');
    return personNode.properties as PersonNode;
  }

  /**
   * Search for HumanConnection nodes that contain a specific user name
   */
  async searchHumanConnectionsByName(userName: string): Promise<HumanConnectionNode[]> {
    const query = `
      MATCH (hc:HumanConnection)
      WHERE $userName IN hc.partners
      RETURN hc
    `;

    const result = await this.runQuery(query, { userName });

    return result.records.map((record: any) => {
      const connectionNode = record.get('hc');
      return connectionNode.properties as HumanConnectionNode;
    });
  }

  /**
   * Find HumanConnection candidates by two partner names (case-insensitive, first-name friendly)
   */
  async findConnectionsByPartnerNames(
    userName: string,
    partnerName: string
  ): Promise<HumanConnectionNode[]> {
    if (!userName || !partnerName) {
      return [];
    }

    const userFirstName = userName.split(' ')[0].toLowerCase();
    const partnerFirstName = partnerName.split(' ')[0].toLowerCase();

    // First try exact matching
    const exactQuery = `
      MATCH (hc:HumanConnection)
      WHERE ANY(n IN hc.partners WHERE toLower(n) = $userFirstName)
        AND ANY(n IN hc.partners WHERE toLower(n) = $partnerFirstName)
      RETURN hc
    `;

    let result = await this.runQuery(exactQuery, { userFirstName, partnerFirstName });

    if (result.records.length > 0) {
      return result.records.map((record: any) => {
        const connectionNode = record.get('hc');
        return connectionNode.properties as HumanConnectionNode;
      });
    }

    // If no exact match, try fuzzy matching with CONTAINS for similar names
    const fuzzyQuery = `
      MATCH (hc:HumanConnection)
      WHERE ANY(n IN hc.partners WHERE toLower(n) CONTAINS toLower($userFirstName) OR toLower($userFirstName) CONTAINS toLower(n))
        AND ANY(n IN hc.partners WHERE toLower(n) CONTAINS toLower($partnerFirstName) OR toLower($partnerFirstName) CONTAINS toLower(n))
      RETURN hc
    `;

    result = await this.runQuery(fuzzyQuery, { userFirstName, partnerFirstName });
    return result.records.map((record: any) => {
      const connectionNode = record.get('hc');
      return connectionNode.properties as HumanConnectionNode;
    });
  }

  /**
   * Find HumanConnection by partners and secret for authentication
   * Uses flexible name matching (case-insensitive, first name matching)
   */
  async findHumanConnectionByAuth(
    userName: string,
    partnerName: string,
    secret: string
  ): Promise<HumanConnectionNode | null> {
    // Extract first names and convert to lowercase for flexible matching
    const userFirstName = userName.split(' ')[0].toLowerCase();
    const partnerFirstName = partnerName.split(' ')[0].toLowerCase();

    const query = `
      MATCH (hc:HumanConnection)
      WHERE hc.secret = $secret 
      AND (
        (toLower(hc.partners[0]) = $userFirstName AND toLower(hc.partners[1]) = $partnerFirstName) OR
        (toLower(hc.partners[0]) = $partnerFirstName AND toLower(hc.partners[1]) = $userFirstName)
      )
      RETURN hc
    `;

    const result = await this.runQuery(query, {
      userFirstName,
      partnerFirstName,
      secret,
    });

    if (result.records.length === 0) {
      return null;
    }

    const connectionNode = result.records[0].get('hc');
    return connectionNode.properties as HumanConnectionNode;
  }

  /**
   * Create relationship between Person and existing HumanConnection
   */
  async linkPersonToHumanConnection(
    userId: string,
    humanConnection: HumanConnectionNode
  ): Promise<boolean> {
    const updatedAt = new Date().toISOString();

    if (humanConnection.connectionId) {
      const queryById = `
        MATCH (p:Person {userId: $userId})
        MATCH (hc:HumanConnection {connectionId: $connectionId})
        MERGE (p)-[r:PARTICIPATES_IN]->(hc)
        SET r.role = "partner", r.updatedAt = $updatedAt
        RETURN p, hc
      `;
      const result = await this.runQuery(queryById, {
        userId,
        connectionId: humanConnection.connectionId,
        updatedAt,
      });
      return result.records.length > 0;
    }

    const queryBySecret = `
      MATCH (p:Person {userId: $userId})
      MATCH (hc:HumanConnection {secret: $secret, partners: $partners})
      MERGE (p)-[r:PARTICIPATES_IN]->(hc)
      SET r.role = "partner", r.updatedAt = $updatedAt
      RETURN p, hc
    `;
    const result2 = await this.runQuery(queryBySecret, {
      userId,
      secret: humanConnection.secret,
      partners: humanConnection.partners,
      updatedAt,
    });
    return result2.records.length > 0;
  }

  /**
   * Find a Person node by name within a given HumanConnection
   */
  async findPersonByNameInConnection(
    userName: string,
    humanConnection: HumanConnectionNode
  ): Promise<PersonNode | null> {
    const userNameLower = userName.toLowerCase();

    const byConnectionId = humanConnection.connectionId
      ? `MATCH (hc:HumanConnection {connectionId: $connectionId})`
      : `MATCH (hc:HumanConnection {secret: $secret, partners: $partners})`;

    const query = `
      ${byConnectionId}
      MATCH (p:Person)-[:PARTICIPATES_IN]->(hc)
      WHERE toLower(p.name) = $userNameLower
      RETURN p
      LIMIT 1
    `;

    const result = await this.runQuery(query, {
      userNameLower,
      connectionId: humanConnection.connectionId || null,
      secret: humanConnection.secret,
      partners: humanConnection.partners,
    });

    if (result.records.length === 0) return null;
    const personNode = result.records[0].get('p');
    return personNode.properties as PersonNode;
  }

  /**
   * Update a Person node identified by name within a specific HumanConnection
   * to set runtime-specific identifiers like userId and roomId
   */
  async updatePersonByNameInConnection(
    userName: string,
    humanConnection: HumanConnectionNode,
    updates: { userId?: string; roomId?: string }
  ): Promise<PersonNode | null> {
    const updatedAt = new Date().toISOString();
    const userNameLower = userName.toLowerCase();

    const byConnectionId = humanConnection.connectionId
      ? `MATCH (hc:HumanConnection {connectionId: $connectionId})`
      : `MATCH (hc:HumanConnection {secret: $secret, partners: $partners})`;

    const query = `
      ${byConnectionId}
      MATCH (p:Person)-[:PARTICIPATES_IN]->(hc)
      WHERE toLower(p.name) = $userNameLower
      SET p.userId = COALESCE($userId, p.userId),
          p.roomId = COALESCE($roomId, p.roomId),
          p.updatedAt = $updatedAt
      RETURN p
    `;

    const result = await this.runQuery(query, {
      userNameLower,
      connectionId: humanConnection.connectionId || null,
      secret: humanConnection.secret,
      partners: humanConnection.partners,
      userId: updates.userId || null,
      roomId: updates.roomId || null,
      updatedAt,
    });

    if (result.records.length === 0) return null;
    const personNode = result.records[0].get('p');
    return personNode.properties as PersonNode;
  }

  /**
   * Get all HumanConnection nodes for potential matching
   */
  async getAllHumanConnections(): Promise<HumanConnectionNode[]> {
    const query = `
      MATCH (hc:HumanConnection)
      RETURN hc
    `;

    const result = await this.runQuery(query);

    return result.records.map((record: any) => {
      const connectionNode = record.get('hc');
      return connectionNode.properties as HumanConnectionNode;
    });
  }

  /**
   * Get all active HumanConnection nodes that have exactly two Person nodes participating
   */
  async getActiveHumanConnections(): Promise<
    Array<{
      connection: HumanConnectionNode;
      participants: PersonNode[];
    }>
  > {
    const query = `
      MATCH (hc:HumanConnection)
      WHERE hc.status = "active" OR hc.status IS NULL
      MATCH (p:Person)-[:PARTICIPATES_IN]->(hc)
      WITH hc, collect(p) as participants
      WHERE size(participants) = 2
      RETURN hc, participants
    `;

    const result = await this.runQuery(query);

    return result.records.map((record: any) => {
      const connectionNode = record.get('hc');
      const participantNodes = record.get('participants');

      return {
        connection: connectionNode.properties as HumanConnectionNode,
        participants: participantNodes.map((p: any) => p.properties as PersonNode),
      };
    });
  }

  /**
   * Update HumanConnection status
   */
  async updateHumanConnectionStatus(
    partners: string[],
    secret: string,
    status: string
  ): Promise<boolean> {
    const updatedAt = new Date().toISOString();

    const query = `
      MATCH (hc:HumanConnection {partners: $partners, secret: $secret})
      SET hc.status = $status, hc.updatedAt = $updatedAt
      RETURN hc
    `;

    const result = await this.runQuery(query, {
      partners,
      secret,
      status,
      updatedAt,
    });

    return result.records.length > 0;
  }

  /**
   * Deduplicate Person nodes that share the same userId by merging PARTICIPATES_IN
   * relationships into a single kept node and deleting the extras.
   * Returns the number of removed duplicates.
   */
  async deduplicatePersonsByUserId(userId: string): Promise<number> {
    const updatedAt = new Date().toISOString();

    const query = `
      MATCH (p:Person {userId: $userId})
      WITH collect(p) AS persons
      WHERE size(persons) > 1
      WITH head(persons) AS keep, tail(persons) AS dups
      UNWIND dups AS dup
      // Move outgoing PARTICIPATES_IN
      OPTIONAL MATCH (dup)-[r:PARTICIPATES_IN]->(hc:HumanConnection)
      MERGE (keep)-[r2:PARTICIPATES_IN]->(hc)
      SET r2 += r, r2.updatedAt = $updatedAt
      DELETE r
      WITH keep, dup
      // Consolidate basic properties
      SET keep.name = COALESCE(keep.name, dup.name),
          keep.roomId = COALESCE(keep.roomId, dup.roomId),
          keep.pronouns = COALESCE(keep.pronouns, dup.pronouns),
          keep.updatedAt = $updatedAt
      DELETE dup
      RETURN 1 AS removed
    `;

    const result = await this.runQuery(query, { userId, updatedAt });
    return result.records.length; // number of rows processed equals number of duplicates removed
  }

  /**
   * Get all Person nodes that participate in a specific HumanConnection
   */
  async getConnectionParticipants(humanConnection: HumanConnectionNode): Promise<PersonNode[]> {
    const byConnectionId = humanConnection.connectionId
      ? `MATCH (hc:HumanConnection {connectionId: $connectionId})`
      : `MATCH (hc:HumanConnection {secret: $secret, partners: $partners})`;

    const query = `
      ${byConnectionId}
      MATCH (p:Person)-[:PARTICIPATES_IN]->(hc)
      RETURN p
    `;

    const result = await this.runQuery(query, {
      connectionId: humanConnection.connectionId || null,
      secret: humanConnection.secret,
      partners: humanConnection.partners,
    });

    return result.records.map((record: any) => {
      const personNode = record.get('p');
      return personNode.properties as PersonNode;
    });
  }
}

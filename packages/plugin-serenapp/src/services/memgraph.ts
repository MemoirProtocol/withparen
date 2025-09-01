import neo4j from 'neo4j-driver';

export interface MemgraphConfig {
  host?: string;
  port?: string;
  username?: string;
  password?: string;
}

export interface HumanConnectionNode {
  connectionId: string;
  partners: string[];
  secret?: string;
  status: string;
  createdAt?: string;
  updatedAt: string;
}

export interface PersonNode {
  webId: string;
  name?: string;
  email?: string;
  firebaseId?: string;
  firebaseToken?: string;
  authorId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ParticipatesInRelationship {
  role?: string;
  updatedAt: string;
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
   * Create a HumanConnection node with waitlist status
   */
  async createHumanConnectionWithWaitlist(
    connectionId: string,
    username?: string,
    partnername?: string,
    secret?: string
  ): Promise<HumanConnectionNode> {
    const now = new Date().toISOString();

    // Build partners array from available names
    const partners: string[] = [];
    if (username) partners.push(username);
    if (partnername) partners.push(partnername);

    const query = `
      CREATE (hc:HumanConnection {
        connectionId: $connectionId,
        partners: $partners,
        secret: $secret,
        status: "waitlist",
        createdAt: $now,
        updatedAt: $now
      })
      RETURN hc
    `;

    const result = await this.runQuery(query, {
      connectionId,
      partners,
      secret: secret || null,
      now,
    });

    const connectionNode = result.records[0].get('hc');
    return connectionNode.properties as HumanConnectionNode;
  }

  /**
   * Find existing HumanConnection by connectionId
   */
  async findConnectionByConnectionId(connectionId: string): Promise<HumanConnectionNode | null> {
    const query = `
      MATCH (hc:HumanConnection {connectionId: $connectionId})
      RETURN hc
    `;

    const result = await this.runQuery(query, { connectionId });

    if (result.records.length === 0) {
      return null;
    }

    const connectionNode = result.records[0].get('hc');
    return connectionNode.properties as HumanConnectionNode;
  }

  /**
   * Check if a complete HumanConnection already exists with the same partners and secret
   */
  async findExistingHumanConnection(
    username: string,
    partnername: string,
    secret: string
  ): Promise<HumanConnectionNode | null> {
    const query = `
      MATCH (hc:HumanConnection)
      WHERE hc.secret = $secret 
      AND size(hc.partners) = 2
      AND (
        (hc.partners[0] = $username AND hc.partners[1] = $partnername) OR
        (hc.partners[0] = $partnername AND hc.partners[1] = $username)
      )
      RETURN hc
    `;

    const result = await this.runQuery(query, {
      username,
      partnername,
      secret,
    });

    if (result.records.length === 0) {
      return null;
    }

    const connectionNode = result.records[0].get('hc');
    return connectionNode.properties as HumanConnectionNode;
  }

  /**
   * Get all HumanConnection nodes with waitlist status
   */
  async getWaitlistConnections(): Promise<HumanConnectionNode[]> {
    const query = `
      MATCH (hc:HumanConnection {status: "waitlist"})
      RETURN hc
    `;

    const result = await this.runQuery(query);

    return result.records.map((record: any) => {
      const connectionNode = record.get('hc');
      return connectionNode.properties as HumanConnectionNode;
    });
  }

  /**
   * Get all complete HumanConnection nodes (with all required fields)
   */
  async getCompleteConnections(): Promise<HumanConnectionNode[]> {
    const query = `
      MATCH (hc:HumanConnection)
      WHERE size(hc.partners) = 2
      AND hc.secret IS NOT NULL
      RETURN hc
    `;

    const result = await this.runQuery(query);

    return result.records.map((record: any) => {
      const connectionNode = record.get('hc');
      return connectionNode.properties as HumanConnectionNode;
    });
  }

  /**
   * Update HumanConnection with partial information
   */
  async updateHumanConnection(
    connectionId: string,
    updates: { username?: string; partnername?: string; secret?: string }
  ): Promise<HumanConnectionNode | null> {
    const updatedAt = new Date().toISOString();

    // First get the existing connection to merge partners
    const existingConnection = await this.findConnectionByConnectionId(connectionId);
    if (!existingConnection) {
      return null;
    }

    // Build new partners array
    let newPartners = [...(existingConnection.partners || [])];

    // Update partners array based on provided updates
    if (updates.username !== undefined) {
      // Remove any existing username and add new one at index 0
      newPartners = newPartners.filter((p) => p !== updates.username);
      if (updates.username) {
        newPartners.unshift(updates.username);
      }
    }

    if (updates.partnername !== undefined) {
      // Remove any existing partnername and add new one
      newPartners = newPartners.filter((p) => p !== updates.partnername);
      if (updates.partnername) {
        // Add partnername at index 1 if username exists, otherwise at index 0
        if (newPartners.length > 0) {
          newPartners.push(updates.partnername);
        } else {
          newPartners.unshift(updates.partnername);
        }
      }
    }

    // Ensure we don't have more than 2 partners and remove duplicates
    const uniquePartners = Array.from(new Set(newPartners));
    newPartners = uniquePartners.slice(0, 2);

    // Build SET clause dynamically
    const setClauses = ['hc.updatedAt = $updatedAt', 'hc.partners = $partners'];
    const params: any = { connectionId, updatedAt, partners: newPartners };

    if (updates.secret !== undefined) {
      setClauses.push('hc.secret = $secret');
      params.secret = updates.secret;
    }

    const query = `
      MATCH (hc:HumanConnection {connectionId: $connectionId})
      SET ${setClauses.join(', ')}
      RETURN hc
    `;

    const result = await this.runQuery(query, params);

    if (result.records.length === 0) {
      return null;
    }

    const connectionNode = result.records[0].get('hc');
    return connectionNode.properties as HumanConnectionNode;
  }

  /**
   * Update HumanConnection status
   */
  async updateConnectionStatus(
    connectionId: string,
    newStatus: string
  ): Promise<HumanConnectionNode | null> {
    const updatedAt = new Date().toISOString();

    const query = `
      MATCH (hc:HumanConnection {connectionId: $connectionId})
      SET hc.status = $newStatus, hc.updatedAt = $updatedAt
      RETURN hc
    `;

    const result = await this.runQuery(query, {
      connectionId,
      newStatus,
      updatedAt,
    });

    if (result.records.length === 0) {
      return null;
    }

    const connectionNode = result.records[0].get('hc');
    return connectionNode.properties as HumanConnectionNode;
  }

  /**
   * Create a Person node with authentication information
   */
  async createPerson(
    webId: string,
    email?: string,
    firebaseId?: string,
    firebaseToken?: string,
    authorId?: string
  ): Promise<PersonNode> {
    const now = new Date().toISOString();

    const query = `
      MERGE (p:Person {webId: $webId})
      SET p.email = $email,
          p.firebaseId = $firebaseId,
          p.firebaseToken = $firebaseToken,
          p.authorId = $authorId,
          p.createdAt = COALESCE(p.createdAt, $now),
          p.updatedAt = $now
      RETURN p
    `;

    const result = await this.runQuery(query, {
      webId,
      email: email || null,
      firebaseId: firebaseId || null,
      firebaseToken: firebaseToken || null,
      authorId: authorId || null,
      now,
    });

    const personNode = result.records[0].get('p');
    return personNode.properties as PersonNode;
  }

  /**
   * Update a Person's name
   */
  async updatePersonName(webId: string, name: string): Promise<PersonNode | null> {
    const now = new Date().toISOString();
    const query = `
      MATCH (p:Person {webId: $webId})
      SET p.name = $name,
          p.updatedAt = $now
      RETURN p
    `;

    const result = await this.runQuery(query, { webId, name, now });
    if (result.records.length === 0) return null;
    const personNode = result.records[0].get('p');
    return personNode.properties as PersonNode;
  }

  /**
   * Update Person authentication-related fields by webId
   */
  async updatePersonAuthByWebId(
    webId: string,
    {
      email,
      firebaseId,
      firebaseToken,
      authorId,
      name,
    }: {
      email?: string;
      firebaseId?: string;
      firebaseToken?: string;
      authorId?: string;
      name?: string;
    }
  ): Promise<PersonNode | null> {
    const now = new Date().toISOString();
    const query = `
      MATCH (p:Person {webId: $webId})
      SET p.email = COALESCE($email, p.email),
          p.firebaseId = COALESCE($firebaseId, p.firebaseId),
          p.firebaseToken = COALESCE($firebaseToken, p.firebaseToken),
          p.authorId = COALESCE($authorId, p.authorId),
          p.name = COALESCE($name, p.name),
          p.updatedAt = $now
      RETURN p
    `;

    const result = await this.runQuery(query, {
      webId,
      email: email ?? null,
      firebaseId: firebaseId ?? null,
      firebaseToken: firebaseToken ?? null,
      authorId: authorId ?? null,
      name: name ?? null,
      now,
    });
    if (result.records.length === 0) return null;
    const personNode = result.records[0].get('p');
    return personNode.properties as PersonNode;
  }

  /**
   * Find Person by webId
   */
  async findPersonByWebId(webId: string): Promise<PersonNode | null> {
    const query = `
      MATCH (p:Person {webId: $webId})
      RETURN p
    `;

    const result = await this.runQuery(query, { webId });

    if (result.records.length === 0) {
      return null;
    }

    const personNode = result.records[0].get('p');
    return personNode.properties as PersonNode;
  }

  /**
   * Find Person by firebaseId
   */
  async findPersonByFirebaseId(firebaseId: string): Promise<PersonNode | null> {
    const query = `
      MATCH (p:Person {firebaseId: $firebaseId})
      RETURN p
    `;

    const result = await this.runQuery(query, { firebaseId });
    if (result.records.length === 0) return null;
    const personNode = result.records[0].get('p');
    return personNode.properties as PersonNode;
  }

  /**
   * Update Person by firebaseId and optionally set/override webId
   */
  async updatePersonAuthByFirebaseId(
    firebaseId: string,
    {
      email,
      firebaseToken,
      authorId,
      name,
    }: { email?: string; firebaseToken?: string; authorId?: string; name?: string }
  ): Promise<PersonNode | null> {
    const now = new Date().toISOString();
    const query = `
      MATCH (p:Person {firebaseId: $firebaseId})
      SET p.email = COALESCE($email, p.email),
          p.firebaseToken = COALESCE($firebaseToken, p.firebaseToken),
          p.authorId = COALESCE($authorId, p.authorId),
          p.name = COALESCE($name, p.name),
          p.updatedAt = $now
      RETURN p
    `;

    const result = await this.runQuery(query, {
      firebaseId,
      email: email ?? null,
      firebaseToken: firebaseToken ?? null,
      authorId: authorId ?? null,
      name: name ?? null,
      now,
    });
    if (result.records.length === 0) return null;
    const personNode = result.records[0].get('p');
    return personNode.properties as PersonNode;
  }

  /**
   * Link a Person to a HumanConnection with PARTICIPATES_IN relationship
   */
  async linkPersonToConnection(
    webId: string,
    connectionId: string,
    role: string = 'partner'
  ): Promise<ParticipatesInRelationship | null> {
    const now = new Date().toISOString();
    const query = `
      MATCH (p:Person {webId: $webId})
      MATCH (hc:HumanConnection {connectionId: $connectionId})
      MERGE (p)-[r:PARTICIPATES_IN]->(hc)
      SET r.role = $role,
          r.updatedAt = $now
      RETURN r
    `;

    const result = await this.runQuery(query, { webId, connectionId, role, now });
    if (result.records.length === 0) return null;
    const rel = result.records[0].get('r');
    return rel.properties as ParticipatesInRelationship;
  }
}

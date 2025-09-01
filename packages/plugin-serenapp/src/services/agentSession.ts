import { Service, type IAgentRuntime, logger } from '@elizaos/core';
import { ElizaClient } from '@elizaos/api-client';

export class AgentSessionService extends Service {
  static serviceType = 'agent_session';
  capabilityDescription = 'Handles agent session lifecycle and messaging via @elizaos/api-client';

  private client!: ElizaClient;
  private sessionId?: string;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  static async start(runtime: IAgentRuntime) {
    const svc = new AgentSessionService(runtime);
    await svc.initClient();
    return svc;
  }

  private async initClient() {
    const baseUrl =
      (this.runtime.getSetting('AGENT_SERVER_URL') as string) ||
      process.env.AGENT_SERVER_URL ||
      'http://localhost:3000';

    const authToken =
      (this.runtime.getSetting('AGENT_SERVER_TOKEN') as string) || process.env.AGENT_SERVER_TOKEN;

    this.client = ElizaClient.create({
      baseUrl,
      headers: authToken
        ? { 'X-API-KEY': authToken, Authorization: `Bearer ${authToken}` }
        : undefined,
    } as any);

    logger.info(`[AgentSessionService] API client initialized for ${baseUrl}`);
  }

  async ensureSession(params?: {
    userId?: string;
    agentId?: string;
    metadata?: Record<string, any>;
  }) {
    if (this.sessionId) return this.sessionId;

    const userId = params?.userId || this.runtime.agentId + ':serenapp-user';
    const agentId = params?.agentId || this.runtime.agentId;

    const res = await this.client.sessions.createSession({
      userId,
      agentId,
      metadata: { source: 'plugin-serenapp', ...params?.metadata },
    });

    this.sessionId = res.sessionId;
    logger.info({ sessionId: this.sessionId }, '[AgentSessionService] Created session');
    return this.sessionId;
  }

  async sendMessage(text: string, opts?: { role?: string; metadata?: Record<string, any> }) {
    const sid = await this.ensureSession();
    return this.client.sessions.sendMessage(sid, {
      content: text,
      role: (opts?.role as any) || 'user',
      metadata: opts?.metadata,
    } as any);
  }

  async getMessages(params?: {
    limit?: number;
    before?: Date | number | string;
    after?: Date | number | string;
  }) {
    const sid = await this.ensureSession();
    return this.client.sessions.getMessages(sid, params as any);
  }

  static async stop(runtime: IAgentRuntime) {
    const svc = runtime.getService(AgentSessionService.serviceType);
    if (svc) await (svc as AgentSessionService).stop();
  }

  async stop() {
    // Nothing to clean up for now
  }
}

/**
 * Browser Session Manager (Phase 9.0 + 9.1.8 lifecycle hardening).
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

export interface BrowserSession {
  id: string;
  executionId?: string;
  ownerId?: string;
  context: BrowserContext;
  page: Page;
  createdAt: Date;
  lastActivityAt: Date;
}

export interface BrowserSessionOptions {
  timeoutMs?: number;
  userAgent?: string;
  viewport?: { width: number; height: number };
}

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

export class BrowserSessionManager {
  private browser: Browser | null = null;
  private sessions: Map<string, BrowserSession> = new Map();
  private sessionOwners: Map<string, { executionId: string; ownerId: string }> = new Map();

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }
  }

  async createSession(
    sessionId: string,
    options: BrowserSessionOptions = {},
    ownership?: { executionId: string; ownerId: string },
  ): Promise<BrowserSession> {
    if (!this.browser) {
      await this.initialize();
    }

    const context = await this.browser!.newContext({
      viewport: options.viewport ?? DEFAULT_VIEWPORT,
      userAgent: options.userAgent,
    });

    context.setDefaultTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    context.setDefaultNavigationTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const page = await context.newPage();

    const session: BrowserSession = {
      id: sessionId,
      executionId: ownership?.executionId,
      ownerId: ownership?.ownerId,
      context,
      page,
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };

    this.sessions.set(sessionId, session);
    if (ownership) {
      this.sessionOwners.set(sessionId, ownership);
    }
    return session;
  }

  getSession(sessionId: string): BrowserSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Reverse lookup: find the session associated with an execution. */
  findSessionByExecution(executionId: string): BrowserSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.executionId === executionId) {
        return session;
      }
    }
    return undefined;
  }

  getOwner(sessionId: string): { executionId: string; ownerId: string } | undefined {
    return this.sessionOwners.get(sessionId);
  }

  async closeSession(sessionId: string, requester?: { executionId?: string; ownerId?: string }): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const owner = this.sessionOwners.get(sessionId);
    if (owner && requester) {
      if (requester.executionId && requester.executionId !== owner.executionId) return false;
      if (requester.ownerId && requester.ownerId !== owner.ownerId) return false;
    }

    try {
      await session.context.close();
    } catch {
      // best-effort
    }
    this.sessions.delete(sessionId);
    this.sessionOwners.delete(sessionId);
    return true;
  }

  async closeAll(): Promise<void> {
    for (const [id, session] of this.sessions) {
      try {
        await session.context.close();
      } catch {
        // best-effort
      }
    }
    this.sessions.clear();
    this.sessionOwners.clear();
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // best-effort
      }
      this.browser = null;
    }
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  getStaleSessions(timeoutMs: number): string[] {
    const now = Date.now();
    const stale: string[] = [];
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivityAt.getTime() > timeoutMs) {
        stale.push(id);
      }
    }
    return stale;
  }

  touchSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = new Date();
    }
  }
}

export const browserSessionManager = new BrowserSessionManager();

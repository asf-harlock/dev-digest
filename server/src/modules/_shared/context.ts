import type { FastifyRequest } from 'fastify';
import type { Container } from '../../platform/container.js';

export interface RequestContext {
  workspaceId: string;
  userId: string;
}

/**
 * Resolve the tenancy context for a request via the AuthProvider. In MVP
 * (LocalNoAuthProvider) this always returns the default workspace + system user.
 * Every module uses this so workspace scoping is never forgotten.
 */
export async function getContext(
  container: Container,
  req: FastifyRequest,
): Promise<Readonly<RequestContext>> {
  const [user, workspace] = await Promise.all([
    container.auth.currentUser(req),
    container.auth.currentWorkspace(req),
  ]);
  // Frozen so a handler can't re-point workspaceId mid-request and read
  // another tenant's rows through a later query.
  return Object.freeze({ workspaceId: workspace.id, userId: user.id });
}

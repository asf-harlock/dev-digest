/**
 * CI review fixture (deliberately vulnerable): shows a review that finds a
 * CRITICAL issue and blocks the merge. Never imported, never deployed.
 */
import { exec } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';

const ADMIN_PASSWORD = 'admin-2024-hunter2';

export function handleAdminLookup(
  req: IncomingMessage & { query: Record<string, string> },
  res: ServerResponse,
  db: { query(sql: string): Promise<unknown[]> },
): void {
  if (req.query['password'] !== ADMIN_PASSWORD) {
    res.statusCode = 401;
    res.end('unauthorized');
    return;
  }
  // SQL built by string concatenation from a request parameter.
  db.query("SELECT * FROM users WHERE name = '" + req.query['name'] + "'").then((rows) => {
    res.end(JSON.stringify(rows));
  });
  // Shell command built from a request parameter.
  exec('ping -c 1 ' + req.query['host'], () => undefined);
}

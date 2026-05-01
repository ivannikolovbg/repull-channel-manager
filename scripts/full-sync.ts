/**
 * CLI to run a full sync for a workspace.
 *
 *   pnpm full-sync <workspaceId>
 */

import { runFullSync } from '../core/services/sync';

async function main() {
  const workspaceId = process.argv[2];
  if (!workspaceId) {
    console.error('usage: pnpm full-sync <workspaceId>');
    process.exit(2);
  }
  const stats = await runFullSync(workspaceId);
  console.log(JSON.stringify(stats, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

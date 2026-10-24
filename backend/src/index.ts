import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { pool } from "./db/pool.js";

const app = createApp();

const server = app.listen(env.PORT, (error) => {
  if (error) {
    console.error(`Failed to listen on port ${env.PORT}: ${error.message}`);
    process.exit(1);
  }
  console.log(`sprout-api listening on port ${env.PORT}`);
});

let shuttingDown = false;

// Cloud Run sends SIGTERM before stopping an instance: stop accepting and drain in-flight requests.
function shutdown(signal: NodeJS.Signals) {
  // A second signal (Ctrl+C twice) skips the drain instead of ending the pool a second time.
  if (shuttingDown) process.exit(1);
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    // Only after in-flight requests (and their queries) have finished.
    pool.end().then(
      () => process.exit(0),
      (err: unknown) => {
        console.error("Error closing the Postgres pool", err);
        process.exit(1);
      },
    );
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

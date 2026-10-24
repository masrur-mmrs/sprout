import { env } from "./config/env.js";
import { createApp } from "./app.js";

const app = createApp();

const server = app.listen(env.PORT, (error) => {
  if (error) {
    console.error(`Failed to listen on port ${env.PORT}: ${error.message}`);
    process.exit(1);
  }
  console.log(`sprout-api listening on port ${env.PORT}`);
});

// Cloud Run sends SIGTERM before stopping an instance: stop accepting and drain in-flight requests.
function shutdown(signal: NodeJS.Signals) {
  console.log(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

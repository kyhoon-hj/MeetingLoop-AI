import { startWorkerRuntime } from "./index";

void startWorkerRuntime().then((shutdown) => {
  const stop = () => {
    void shutdown().then(() => process.exit(0)).catch((error: unknown) => {
      console.error("worker shutdown failed", error instanceof Error ? error.message : "UNKNOWN_ERROR");
      process.exit(1);
    });
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}).catch((error: unknown) => {
  console.error("worker startup failed", error instanceof Error ? error.message : "UNKNOWN_ERROR");
  process.exitCode = 1;
});

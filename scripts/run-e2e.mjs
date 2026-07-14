import { spawn } from "node:child_process";

const host = "127.0.0.1";
const port = "3000";
const baseUrl = `http://${host}:${port}`;

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (error) {
      void error;
    }
    await wait(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      ...options
    });

    child.on("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "apps/web", "--hostname", host, "--port", port],
  {
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      CI: "true",
      NEXT_TELEMETRY_DISABLED: "1"
    }
  }
);

let exitCode = 1;

try {
  await waitForServer(baseUrl, 120000);
  exitCode = await run(
    process.execPath,
    ["node_modules/playwright/cli.js", "test", "--reporter=line", "--workers=1"],
    {
      env: {
        ...process.env,
        CI: "true"
      }
    }
  );
} finally {
  if (!server.killed) {
    server.kill();
  }
}

process.exitCode = exitCode;

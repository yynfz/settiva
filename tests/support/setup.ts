import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";
import { SignJWT, jwtVerify } from "jose";
import type { TestProject } from "vitest/node";

const ids = {
  alice: "11111111-1111-4111-8111-111111111111",
  bob: "22222222-2222-4222-8222-222222222222",
  outsider: "33333333-3333-4333-8333-333333333333",
};
async function port() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}
async function jsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}
function send(res: ServerResponse, body: unknown, status = 200) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(body));
}
async function waitFor(url: string, child?: ChildProcess) {
  for (let i = 0; i < 150; i++) {
    if (child && (child.exitCode != null || child.signalCode != null))
      throw new Error(`Process exited: ${child.exitCode ?? child.signalCode}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
export default async function setup(project: TestProject) {
  const dir = await mkdtemp(join(tmpdir(), "settiva-test-"));
  const pgPort = await port(),
    restPort = await port(),
    externalPort = await port(),
    appPort = await port();
  const jwtSecret = randomBytes(32).toString("hex");
  const key = new TextEncoder().encode(jwtSecret);
  const sign = (role: string, sub?: string) =>
    new SignJWT({ role, sub, aud: "authenticated" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
  const anonKey = await sign("anon"),
    serviceKey = await sign("service_role");
  const tokens = Object.fromEntries(
    await Promise.all(
      Object.entries(ids).map(async ([name, id]) => [
        name,
        await sign("authenticated", id),
      ]),
    ),
  );
  const pg = new EmbeddedPostgres({
    databaseDir: join(dir, "db"),
    port: pgPort,
    user: "postgres",
    password: "local-test-only",
    persistent: false,
    autoRehydrateSymlinks: true,
    postgresFlags: ["-h", "127.0.0.1", "-k", dir],
    onLog: () => {},
    onError: () => {},
  });
  const processes: ChildProcess[] = [];
  let server: ReturnType<typeof createServer> | undefined;
  let client: ReturnType<typeof pg.getPgClient> | undefined;
  const log: string[] = [];
  const stop = async () => {
    for (const child of processes.reverse()) {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        await Promise.race([
          once(child, "exit"),
          new Promise((r) => setTimeout(r, 5000)),
        ]);
      }
    }
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await client?.end();
    await pg.stop();
  };
  try {
    await pg.initialise();
    await pg.start();
    client = pg.getPgClient();
    await client.connect();
    await client.query(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb default '{}'::jsonb, invited_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
      grant usage on schema auth, public to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to service_role;
    `);
    for (const file of (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      await client.query(
        await readFile(join("supabase/migrations", file), "utf8"),
      );
    }
    for (const [name, id] of Object.entries(ids)) {
      // Fixtures represent identities supplied by the external Auth service.
      // Outsider is a legacy non-invited identity: it predates the signup guard.
      if (name === "outsider")
        await client.query("alter table auth.users disable trigger user");
      await client.query(
        "insert into auth.users (id,email,raw_app_meta_data) values ($1,$2,$3)",
        [
          id,
          `${name}@example.test`,
          name === "outsider" ? {} : { settiva_invited: true },
        ],
      );
      if (name === "outsider")
        await client.query("alter table auth.users enable trigger user");
    }
    const launch = (
      command: string,
      args: string[],
      env: NodeJS.ProcessEnv,
    ) => {
      const child = spawn(command, args, {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout?.on("data", (d) => log.push(String(d)));
      child.stderr?.on("data", (d) => log.push(String(d)));
      processes.push(child);
      return child;
    };
    const rest = launch(resolve(".test-cache/bin/postgrest"), [], {
      ...process.env,
      PGRST_DB_URI: `postgres://postgres:local-test-only@127.0.0.1:${pgPort}/postgres`,
      DYLD_LIBRARY_PATH: resolve(
        `node_modules/@embedded-postgres/darwin-${process.arch}/native/lib`,
      ),
      PGRST_DB_SCHEMAS: "public",
      PGRST_DB_ANON_ROLE: "anon",
      PGRST_JWT_SECRET: jwtSecret,
      PGRST_SERVER_HOST: "127.0.0.1",
      PGRST_SERVER_PORT: String(restPort),
    });
    await waitFor(`http://127.0.0.1:${restPort}`, rest);
    let rpcScenario = "ready";
    const fallback = process.env.SETTIVA_TEST_ASSET === "test-token";
    server = createServer(async (req, res) => {
      try {
        if (req.method === "OPTIONS") {
          res.writeHead(204, {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "*",
          });
          res.end();
          return;
        }
        const url = new URL(req.url!, `http://127.0.0.1:${externalPort}`);
        if (url.pathname === "/__reset") {
          rpcScenario = "ready";
          await client!.query("delete from public.merchant_profiles");
          send(res, {});
          return;
        }
        if (url.pathname === "/__scenario") {
          rpcScenario = (await jsonBody(req)).scenario;
          send(res, {});
          return;
        }
        if (url.pathname.startsWith("/rest/v1")) {
          const headers = new Headers();
          for (const [name, value] of Object.entries(req.headers))
            if (
              value &&
              !["host", "content-length", "connection"].includes(name)
            )
              headers.set(name, String(value));
          const body = ["POST", "PUT", "PATCH"].includes(req.method!)
            ? JSON.stringify(await jsonBody(req))
            : undefined;
          const upstream = await fetch(
            `http://127.0.0.1:${restPort}${url.pathname.slice("/rest/v1".length)}${url.search}`,
            { method: req.method, headers, body },
          );
          res.writeHead(upstream.status, {
            "content-type":
              upstream.headers.get("content-type") || "application/json",
            "access-control-allow-origin": "*",
          });
          res.end(await upstream.text());
          return;
        }
        if (url.pathname === "/auth/v1/token") {
          const input = await jsonBody(req);
          const name = String(input.email).split("@")[0];
          if (!(name in ids) || input.password !== "test-only-password") {
            send(res, { message: "Invalid credentials" }, 400);
            return;
          }
          send(res, {
            access_token: tokens[name],
            refresh_token: "test-refresh",
            expires_in: 3600,
            token_type: "bearer",
            user: {
              id: ids[name as keyof typeof ids],
              email: input.email,
              aud: "authenticated",
              app_metadata: {},
            },
          });
          return;
        }
        if (url.pathname === "/auth/v1/user") {
          try {
            const { payload } = await jwtVerify(
              (req.headers.authorization || "").replace("Bearer ", ""),
              key,
            );
            if (!payload.sub) throw new Error("Missing subject");
            send(res, {
              id: payload.sub,
              aud: "authenticated",
              app_metadata: {},
              email: "merchant@example.test",
            });
          } catch {
            send(res, { message: "Invalid token" }, 401);
          }
          return;
        }
        if (url.pathname === "/auth/v1/logout") {
          send(res, {});
          return;
        }
        if (url.pathname === "/auth/v1/signup") {
          try {
            await client!.query(
              "insert into auth.users(id,email) values ('44444444-4444-4444-8444-444444444444','signup@example.test')",
            );
            send(res, { created: true });
          } catch {
            send(res, { message: "Invitations only" }, 403);
          }
          return;
        }
        if (url.pathname === "/rpc") {
          const call = await jsonBody(req);
          if (rpcScenario === "offline") {
            send(res, {}, 503);
            return;
          }
          if (call.method === "status") {
            send(res, {
              jsonrpc: "2.0",
              id: call.id,
              result: {
                chain_id:
                  rpcScenario === "wrong-network" ? "mainnet" : "testnet",
              },
            });
            return;
          }
          if (call.params.request_type === "view_account") {
            if (rpcScenario === "missing-account") {
              send(res, { error: { cause: { name: "UNKNOWN_ACCOUNT" } } });
              return;
            }
            send(res, { result: { amount: "1000000000000000000000000" } });
            return;
          }
          const outputs: Record<string, unknown> = {
            ft_metadata: {
              spec: "ft-1.0.0",
              name: fallback ? "Test Dollar" : "USDC",
              symbol:
                rpcScenario === "wrong-metadata"
                  ? "SCAM"
                  : fallback
                    ? "TUSD"
                    : "USDC",
              decimals: rpcScenario === "wrong-decimals" ? 18 : 6,
            },
            storage_balance_of:
              rpcScenario === "unregistered"
                ? null
                : { total: "1250000000000000000000", available: "0" },
            storage_balance_bounds: {
              min: "1250000000000000000000",
              max: "1250000000000000000000",
            },
            ft_balance_of: "0",
          };
          send(res, {
            result: {
              result: [
                ...Buffer.from(
                  JSON.stringify(outputs[call.params.method_name]),
                ),
              ],
            },
          });
          return;
        }
        send(res, {}, 404);
      } catch {
        send(res, { message: "Isolated fixture failure" }, 500);
      }
    });
    server.listen(externalPort, "127.0.0.1");
    await once(server, "listening");
    const externalUrl = `http://127.0.0.1:${externalPort}`;
    const app = launch(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "dev",
        "--webpack",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(appPort),
      ],
      {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: externalUrl,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey,
        SUPABASE_SECRET_KEY: serviceKey,
        NEAR_TESTNET_RPC_URL: `${externalUrl}/rpc`,
        NEAR_TESTNET_ASSET: fallback ? "test-token" : "circle-usdc",
        NEAR_TESTNET_TEST_TOKEN_CONTRACT: "demo-token.testnet",
        NEAR_TESTNET_TEST_TOKEN_NAME: "Test Dollar",
        NEAR_TESTNET_TEST_TOKEN_SYMBOL: "TUSD",
        NEAR_TESTNET_TEST_TOKEN_DECIMALS: "6",
        ENABLE_MAINNET_PAYMENTS: "false",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    );
    await waitFor(`http://127.0.0.1:${appPort}`, app);
    project.provide("environment", {
      appUrl: `http://127.0.0.1:${appPort}`,
      supabaseUrl: externalUrl,
      anonKey,
      aliceToken: tokens.alice,
      bobToken: tokens.bob,
      outsiderToken: tokens.outsider,
    });
    return async () => {
      await stop();
      await mkdir(".test-cache", { recursive: true });
      await writeFile(".test-cache/process.log", log.join(""));
    };
  } catch (error) {
    await stop();
    console.error(log.join("").slice(-4000));
    throw error;
  }
}

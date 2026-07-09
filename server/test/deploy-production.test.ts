import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = () => resolve(process.cwd(), "..");
const readDeployFile = (path: string) => readFileSync(resolve(root(), path), "utf8");

describe("production deploy assets", () => {
  it("builds a single GeWeHub app image with server, web, nginx, migration entrypoint and silk tools", () => {
    const dockerfile = readDeployFile("deploy/Dockerfile");

    expect(dockerfile).toContain("RUN pnpm --filter @gewehub/server build");
    expect(dockerfile).toContain("RUN pnpm --filter @gewehub/web build");
    expect(dockerfile).toContain("apk add --no-cache nginx ffmpeg libstdc++");
    expect(dockerfile).toContain("COPY --from=build /app/web/dist ./web");
    expect(dockerfile).toContain("COPY deploy/nginx.conf /etc/nginx/http.d/default.conf");
    expect(dockerfile).toContain("ENTRYPOINT [\"/app/entrypoint.sh\"]");
  });

  it("runs migrations before starting server and nginx in the production entrypoint", () => {
    const entrypoint = readDeployFile("deploy/entrypoint.sh");

    expect(entrypoint).toContain("node node_modules/prisma/build/index.js migrate deploy");
    expect(entrypoint).toContain("node dist/main.js");
    expect(entrypoint).toContain("nginx -g 'daemon off;'");
    expect(entrypoint).toContain("FILE_STORAGE_DIR");
  });

  it("serves web assets and proxies api, webhook, file and hosted HTML routes to the local server", () => {
    const nginx = readDeployFile("deploy/nginx.conf");

    expect(nginx).toContain("root /app/web");
    expect(nginx).toContain("location = /api/apps/events");
    expect(nginx).toContain("proxy_set_header Connection \"\"");
    expect(nginx).toContain("proxy_cache off");
    expect(nginx).toContain("gzip off");
    expect(nginx).toContain("proxy_read_timeout 3700s");
    expect(nginx).toContain("add_header X-Accel-Buffering no always");
    expect(nginx).toContain("location ~ ^/(api|webhook|files|h)/");
    expect(nginx).toContain("proxy_pass http://127.0.0.1:3000");
    expect(nginx).toContain("proxy_buffering off");
    expect(nginx).toContain("try_files $uri $uri/ /index.html");
  });

  it("binds production service to localhost port 1870 and persists runtime files on the server", () => {
    const compose = readDeployFile("deploy/docker-compose.prod.yml");

    expect(compose).toContain("container_name: gewehub");
    expect(compose).toContain("PUBLIC_BASE_URL: ${PUBLIC_BASE_URL:-https://gewehub.yunzxu.com}");
    expect(compose).toContain("WEB_ORIGIN: ${WEB_ORIGIN:-${PUBLIC_BASE_URL:-https://gewehub.yunzxu.com}}");
    expect(compose).toContain("127.0.0.1:${HOST_PORT:-1870}:80");
    expect(compose).toContain("./runtime/files:/app/server/storage/files");
    expect(compose).toContain("./runtime/logs:/app/server/storage/logs");
    expect(compose).toContain("external: true");
    expect(compose).toContain("1panel-network");
  });

  it("deploy script builds locally, uploads image/env/compose, and verifies the public base URL", () => {
    const script = readDeployFile("scripts/deploy-gewehub.sh");

    expect(script).toContain("buildx build");
    expect(script).toContain('PLATFORM="${PLATFORM:-linux/amd64}"');
    expect(script).toContain('--platform "$PLATFORM"');
    expect(script).toContain("save \"$IMAGE_NAME\"");
    expect(script).toContain("scp");
    expect(script).toContain("docker load -i");
    expect(script).toContain("docker compose -f docker-compose.prod.yml --env-file .env.production up -d");
    expect(script).toContain("/opt/1panel/www/sites/gewehub.yunzxu.com/proxy/gewehub-sse.conf");
    expect(script).toContain("proxy_buffering off;");
    expect(script).toContain("proxy_read_timeout 3700s;");
    expect(script).toContain("docker exec 1Panel-openresty-Qju3 nginx -s reload");
    expect(script).toContain("https://gewehub.yunzxu.com");
    expect(script).toContain('MYSQL_PASSWORD="${MYSQL_PASSWORD:-${GEWEHUB_DATABASE_PASSWORD:-}}"');
    expect(script).not.toMatch(/MYSQL_PASSWORD="\$\{MYSQL_PASSWORD:-[^$}][^}]*}"/);
  });

  it("deploy script parses Redis requirepass from docker inspect JSON instead of brittle text matching", () => {
    const script = readDeployFile("scripts/deploy-gewehub.sh");

    expect(script).toContain("json.load(sys.stdin)");
    expect(script).toContain('cmd.index("--requirepass")');
    expect(script).not.toContain("sed -n 's/.*--requirepass");
  });
});

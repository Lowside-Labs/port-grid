import { execSync } from "child_process";
import { readFileSync, existsSync, statSync } from "fs";
import { dirname, basename, join } from "path";

/**
 * Scan all listening TCP ports on macOS using lsof,
 * enrich with process info, framework detection, and project name.
 */
export async function scanPorts({ all = false } = {}) {
  const raw = getLsofPorts();
  const dockerPorts = getDockerPorts();
  const seen = new Map();

  for (const entry of raw) {
    const key = entry.port;
    if (seen.has(key)) continue;

    const processInfo = getProcessInfo(entry.pid);
    const projectRoot = findProjectRoot(processInfo.cwd);
    const projectName = projectRoot ? basename(projectRoot) : null;
    const framework = detectFramework(processInfo, projectRoot);
    const docker = dockerPorts.get(entry.port) || null;

    // Skip system ports unless --all
    if (!all && entry.port < 1024 && !docker) continue;
    // Skip common non-dev ports and desktop apps
    if (
      !all &&
      !docker &&
      isSystemProcess(processInfo.command, entry.name)
    )
      continue;
    // Skip desktop apps that aren't dev servers
    if (
      !all &&
      !docker &&
      isDesktopApp(processInfo.command, entry.name)
    )
      continue;

    seen.set(key, {
      port: entry.port,
      pid: entry.pid,
      name: entry.name,
      processName: processInfo.command?.split("/").pop()?.split(" ")[0] || entry.name,
      fullCommand: processInfo.command || "",
      cwd: processInfo.cwd || "",
      projectName: docker?.containerName || projectName || entry.name,
      framework: docker?.image
        ? detectDockerService(docker.image)
        : framework,
      memory: processInfo.mem || "–",
      cpu: processInfo.cpu || "–",
      uptime: processInfo.startTime || "–",
      isDocker: !!docker,
      containerName: docker?.containerName || null,
      containerImage: docker?.image || null,
    });
  }

  return [...seen.values()].sort((a, b) => a.port - b.port);
}

function getLsofPorts() {
  try {
    const out = execSync(
      "lsof -iTCP -sTCP:LISTEN -n -P 2>/dev/null",
      { encoding: "utf-8", timeout: 5000 }
    );
    const lines = out.trim().split("\n").slice(1); // skip header
    const results = [];
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 9) continue;
      const name = parts[0];
      const pid = parseInt(parts[1], 10);
      const addrPort = parts[8]; // e.g. *:3000 or 127.0.0.1:8080
      const port = parseInt(addrPort.split(":").pop(), 10);
      if (isNaN(port) || isNaN(pid)) continue;
      results.push({ name, pid, port });
    }
    return results;
  } catch {
    return [];
  }
}

function getDockerPorts() {
  const map = new Map();
  try {
    const out = execSync(
      'docker ps --format "{{.Ports}}|||{{.Names}}|||{{.Image}}" 2>/dev/null',
      { encoding: "utf-8", timeout: 5000 }
    );
    for (const line of out.trim().split("\n")) {
      if (!line) continue;
      const [portsStr, containerName, image] = line.split("|||");
      const portMatches = portsStr.matchAll(/0\.0\.0\.0:(\d+)->(\d+)/g);
      for (const m of portMatches) {
        map.set(parseInt(m[1], 10), { containerName, image });
      }
    }
  } catch {
    // docker not running — fine
  }
  return map;
}

function getProcessInfo(pid) {
  try {
    const out = execSync(
      `ps -p ${pid} -o comm=,pcpu=,pmem=,lstart=,args= 2>/dev/null`,
      { encoding: "utf-8", timeout: 3000 }
    ).trim();
    const command = out || "";

    let cwd = "";
    try {
      const procInfo = execSync(
        `lsof -a -p ${pid} -d cwd -Fn 2>/dev/null`,
        { encoding: "utf-8", timeout: 3000 }
      );
      const cwdLine = procInfo.split("\n").find((l) => l.startsWith("n/"));
      if (cwdLine) cwd = cwdLine.slice(1);
    } catch {
      // no cwd found
    }

    // Parse ps output for cpu/mem
    let cpu = "–";
    let mem = "–";
    let startTime = "–";
    try {
      const stats = execSync(
        `ps -p ${pid} -o pcpu=,pmem=,etime= 2>/dev/null`,
        { encoding: "utf-8", timeout: 3000 }
      ).trim();
      const parts = stats.split(/\s+/);
      if (parts.length >= 3) {
        cpu = parts[0] + "%";
        mem = parts[1] + "%";
        startTime = parts[2];
      }
    } catch {
      // ok
    }

    return { command, cwd, cpu, mem, startTime };
  } catch {
    return { command: "", cwd: "", cpu: "–", mem: "–", startTime: "–" };
  }
}

function findProjectRoot(cwd) {
  if (!cwd) return null;
  let dir = cwd;
  const markers = [
    "package.json",
    "Cargo.toml",
    "go.mod",
    "pyproject.toml",
    "requirements.txt",
    "Gemfile",
    "pom.xml",
    "build.gradle",
    "composer.json",
    "mix.exs",
  ];
  for (let i = 0; i < 10; i++) {
    for (const marker of markers) {
      if (existsSync(join(dir, marker))) return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function detectFramework(processInfo, projectRoot) {
  const cmd = (processInfo.command || "").toLowerCase();

  // Command-based detection
  const cmdPatterns = [
    [/next/, "Next.js"],
    [/nuxt/, "Nuxt"],
    [/vite/, "Vite"],
    [/webpack-dev-server/, "Webpack"],
    [/react-scripts/, "Create React App"],
    [/angular/, "Angular"],
    [/svelte/, "SvelteKit"],
    [/astro/, "Astro"],
    [/remix/, "Remix"],
    [/gatsby/, "Gatsby"],
    [/express/, "Express"],
    [/fastify/, "Fastify"],
    [/nest/, "NestJS"],
    [/django/, "Django"],
    [/flask/, "Flask"],
    [/fastapi/, "FastAPI"],
    [/uvicorn/, "Uvicorn"],
    [/gunicorn/, "Gunicorn"],
    [/rails/, "Rails"],
    [/puma/, "Puma"],
    [/cargo|rustc/, "Rust"],
    [/go\s+run|gin/, "Go"],
    [/php.*artisan/, "Laravel"],
    [/storybook/, "Storybook"],
    [/esbuild/, "esbuild"],
    [/turbo/, "Turborepo"],
  ];

  for (const [pattern, name] of cmdPatterns) {
    if (pattern.test(cmd)) return name;
  }

  // package.json-based detection
  if (projectRoot) {
    const pkgPath = join(projectRoot, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        const deps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        };
        if (deps["next"]) return "Next.js";
        if (deps["nuxt"]) return "Nuxt";
        if (deps["@sveltejs/kit"]) return "SvelteKit";
        if (deps["svelte"]) return "Svelte";
        if (deps["astro"]) return "Astro";
        if (deps["@remix-run/react"]) return "Remix";
        if (deps["gatsby"]) return "Gatsby";
        if (deps["vite"]) return "Vite";
        if (deps["@angular/core"]) return "Angular";
        if (deps["vue"]) return "Vue";
        if (deps["react"]) return "React";
        if (deps["express"]) return "Express";
        if (deps["fastify"]) return "Fastify";
        if (deps["@nestjs/core"]) return "NestJS";
        if (deps["hono"]) return "Hono";
        if (deps["elysia"]) return "Elysia";
      } catch {
        // corrupted package.json
      }
    }
    if (existsSync(join(projectRoot, "Cargo.toml"))) return "Rust";
    if (existsSync(join(projectRoot, "go.mod"))) return "Go";
    if (existsSync(join(projectRoot, "pyproject.toml"))) return "Python";
    if (existsSync(join(projectRoot, "Gemfile"))) return "Ruby";
  }

  // Process name fallback
  if (cmd.includes("node")) return "Node.js";
  if (cmd.includes("python")) return "Python";
  if (cmd.includes("ruby")) return "Ruby";
  if (cmd.includes("java")) return "Java";
  if (cmd.includes("php")) return "PHP";

  return "Unknown";
}

function detectDockerService(image) {
  const img = image.toLowerCase();
  const services = [
    [/postgres/, "PostgreSQL"],
    [/mysql/, "MySQL"],
    [/mariadb/, "MariaDB"],
    [/mongo/, "MongoDB"],
    [/redis/, "Redis"],
    [/memcached/, "Memcached"],
    [/elasticsearch/, "Elasticsearch"],
    [/kibana/, "Kibana"],
    [/nginx/, "Nginx"],
    [/traefik/, "Traefik"],
    [/rabbitmq/, "RabbitMQ"],
    [/kafka/, "Kafka"],
    [/zookeeper/, "ZooKeeper"],
    [/minio/, "MinIO"],
    [/grafana/, "Grafana"],
    [/prometheus/, "Prometheus"],
    [/mailhog|mailpit/, "Mail"],
    [/adminer/, "Adminer"],
    [/pgadmin/, "pgAdmin"],
  ];
  for (const [pattern, name] of services) {
    if (pattern.test(img)) return name;
  }
  return `Docker (${image.split("/").pop().split(":")[0]})`;
}

function isSystemProcess(command, name) {
  const systemNames = [
    "rapportd",
    "launchd",
    "mDNSResponder",
    "controlce",
    "ControlCe",
    "SystemUIServe",
    "airportd",
    "bluetoothd",
    "remoted",
    "loginwindow",
    "WindowServer",
    "kernel_task",
    "UserEventAgent",
    "sharingd",
    "identityservicesd",
    "com.apple",
    "apsd",
    "bird",
    "cloudd",
    "nsurlsessiond",
    "Dropbox",
    "figma_age",
    "Spotify",
    "WavesLoca",
    "zoom",
    "Slack",
    "Discord",
    "Teams",
    "Logi",
    "coreautha",
    "WiFiAgent",
    "AirPlayXPC",
    "photolibraryd",
  ];
  const lower = (command || "").toLowerCase();
  const lowerName = (name || "").toLowerCase();
  return systemNames.some(
    (s) => lower.includes(s.toLowerCase()) || lowerName.includes(s.toLowerCase())
  );
}

function isDesktopApp(command, name) {
  const cmd = (command || "").toLowerCase();
  const n = (name || "").toLowerCase();
  // Apps installed in /Applications are typically not dev servers
  const desktopApps = [
    "figma", "cursor", "visual studio code", "code helper",
    "spotify", "splice", "adobe", "elgato", "brave", "chrome",
    "firefox", "safari", "1password", "notion", "obsidian",
    "linear", "telegram", "whatsapp", "signal", "postman",
    "insomnia", "sketch", "affinity", "tower", "gitkraken",
    "sourcetree", "iterm", "alacritty", "warp", "hyper",
    "waves", "arc", "raycast", "alfred", "cleanshot",
    "grammarly", "loom", "krisp", "around", "superhuman",
  ];
  for (const app of desktopApps) {
    if (cmd.includes(app) || n.includes(app)) return true;
  }
  // Generic: if it's from /Applications and not a known runtime
  if (cmd.includes("/applications/") && !isDevRuntime(cmd)) return true;
  return false;
}

function isDevRuntime(cmd) {
  const runtimes = ["node", "python", "ruby", "java", "go", "cargo", "php", "perl", "deno", "bun"];
  return runtimes.some((r) => cmd.includes(r));
}

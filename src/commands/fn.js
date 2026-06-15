// fn 서브커맨드 — 서버리스 함수 관리. ls / deploy / inspect / logs / exec / rm
import { readFileSync, existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { request, ApiError } from "../api.js";
import { c, log, table, detail, success, info, warn, error, startSpinner, confirm } from "../ui.js";

const BASE = "/serverless/functions";

function statusBadge(s) {
  return s === "active" ? c.green("● active") : c.gray("○ disabled");
}

function runtimeOf(file) {
  return file.endsWith(".ts") ? "typescript" : "javascript";
}

export async function list(args, flags) {
  const stop = startSpinner("함수 목록 불러오는 중");
  let fns;
  try {
    fns = await request(BASE);
  } catch (e) {
    stop();
    throw e;
  }
  stop();
  if (flags.json) return log(JSON.stringify(fns, null, 2));
  if (!fns.length) {
    info("배포된 함수가 없습니다. `gsmsv fn deploy <file>` 로 배포하세요.");
    return;
  }
  table(
    ["ID", "이름", "런타임", "상태", "수정"],
    fns.map((f) => [
      c.gray(f.id.slice(0, 8)),
      c.bold(f.name),
      f.runtime,
      statusBadge(f.status),
      f.updatedAt ? f.updatedAt.slice(0, 10) : "-",
    ])
  );
}

/** id 접두사 또는 이름으로 함수 찾기 */
async function resolveFn(idOrName) {
  const fns = await request(BASE);
  const f =
    fns.find((x) => x.id === idOrName) ||
    fns.find((x) => x.id.startsWith(idOrName)) ||
    fns.find((x) => x.name === idOrName);
  if (!f) throw new ApiError(404, `함수 '${idOrName}' 을(를) 찾을 수 없습니다.`);
  return f;
}

// 프로젝트 설정(gsmsv.json) 형태:
// { "name": "my-fn", "entry": "index.js", "runtime": "javascript",
//   "timeout": 10000, "memoryLimit": 128, "env": { "KEY": "val" } }
function loadProjectConfig(dir) {
  const p = resolve(dir, "gsmsv.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    throw new ApiError(0, `gsmsv.json 파싱 실패: ${e.message}`);
  }
}

export async function deploy(args, flags) {
  // 대상: 인자로 받은 파일, 또는 현재 디렉토리의 gsmsv.json
  let file = args[0];
  const cfg = loadProjectConfig(process.cwd()) || {};
  if (!file) file = cfg.entry;
  if (!file) {
    return error(
      "배포할 파일을 지정하세요: `gsmsv fn deploy <file.js>`\n" +
        "또는 현재 폴더에 gsmsv.json (entry 필드 포함) 을 두세요."
    );
  }
  const filePath = resolve(process.cwd(), file);
  if (!existsSync(filePath)) return error(`파일을 찾을 수 없습니다: ${filePath}`);

  const code = readFileSync(filePath, "utf8");
  const name = flags.name || cfg.name || basename(file).replace(/\.[jt]s$/, "");
  const runtime = flags.runtime || cfg.runtime || runtimeOf(file);

  const body = {
    name,
    code,
    runtime,
    ...(cfg.description ? { description: cfg.description } : {}),
    ...(cfg.timeout ? { timeout: cfg.timeout } : {}),
    ...(cfg.memoryLimit ? { memoryLimit: cfg.memoryLimit } : {}),
    ...(cfg.env ? { envVars: cfg.env } : {}),
  };

  const stop = startSpinner(`함수 '${name}' 배포 중`);
  try {
    // 같은 이름이 이미 있으면 업데이트(PUT), 없으면 생성(POST) — vercel 의 idempotent 배포처럼.
    const existing = (await request(BASE)).find((x) => x.name === name);
    let res;
    if (existing) {
      res = await request(`${BASE}/${existing.id}`, { method: "PUT", body });
    } else {
      res = await request(BASE, { method: "POST", body });
    }
    stop();
    if (flags.json) return log(JSON.stringify(res, null, 2));
    success(`배포 완료 — ${c.bold(name)} ${c.gray(`(${res.id})`)} ${existing ? c.gray("[갱신]") : c.gray("[신규]")}`);
    info(`실행: gsmsv fn exec ${res.id.slice(0, 8)}   로그: gsmsv fn logs ${res.id.slice(0, 8)}`);
  } catch (e) {
    stop();
    throw e;
  }
}

export async function inspect(args, flags) {
  const f = await resolveFn(args[0]);
  if (flags.json) return log(JSON.stringify(f, null, 2));
  log(c.bold(f.name) + "  " + statusBadge(f.status));
  log(c.gray("─".repeat(36)));
  detail([
    ["ID", f.id],
    ["런타임", f.runtime],
    ["타임아웃", `${f.timeout}ms`],
    ["메모리", `${f.memoryLimit}MB`],
    ["환경변수", Object.keys(f.envVars || {}).length ? Object.keys(f.envVars).join(", ") : "-"],
    ["설명", f.description || "-"],
    ["생성", f.createdAt?.slice(0, 19) || "-"],
    ["수정", f.updatedAt?.slice(0, 19) || "-"],
  ]);
}

export async function logs(args, flags) {
  const f = await resolveFn(args[0]);
  const limit = Number(flags.limit || flags.n || 20);
  const entries = await request(`${BASE}/${f.id}/logs`, { query: { limit, offset: 0 } });
  if (flags.json) return log(JSON.stringify(entries, null, 2));
  if (!entries.length) return info("로그가 없습니다.");
  for (const e of entries.reverse()) {
    const color = e.status === "success" ? c.green : e.status === "timeout" ? c.yellow : c.red;
    log(
      `${c.gray(e.createdAt?.slice(0, 19).replace("T", " "))} ${color(e.status.padEnd(7))} ` +
        `${c.gray(e.trigger)} ${c.dim(`${e.duration}ms`)}`
    );
    for (const line of e.logs || []) log(`  ${c.gray("│")} ${line}`);
    if (e.error) log(`  ${c.red("│")} ${c.red(e.error)}`);
  }
}

export async function exec(args, flags) {
  const f = await resolveFn(args[0]);
  let payload = {};
  if (flags.data) {
    try {
      payload = JSON.parse(flags.data);
    } catch {
      return error("--data 는 유효한 JSON 이어야 합니다.");
    }
  }
  const stop = startSpinner(`'${f.name}' 실행 중`);
  try {
    const r = await request(`${BASE}/${f.id}/execute`, { method: "POST", body: payload });
    stop();
    if (flags.json) return log(JSON.stringify(r, null, 2));
    const color = r.status === "success" ? c.green : r.status === "timeout" ? c.yellow : c.red;
    log(`${color(r.status)} ${c.gray(`HTTP ${r.statusCode} · ${r.duration}ms`)}`);
    if (r.logs?.length) {
      log(c.gray("── logs ──"));
      for (const l of r.logs) log(`  ${l}`);
    }
    if (r.error) error(r.error);
    if (r.body) {
      log(c.gray("── output ──"));
      log(r.body);
    }
  } catch (e) {
    stop();
    throw e;
  }
}

export async function remove(args, flags) {
  const f = await resolveFn(args[0]);
  if (!flags.yes && !(await confirm(`함수 ${c.red(f.name)} 를 삭제할까요?`))) return info("취소했습니다.");
  await request(`${BASE}/${f.id}`, { method: "DELETE" });
  success(`함수 '${f.name}' 삭제 완료.`);
}

export async function run(args, flags) {
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case undefined:
    case "ls":
    case "list":
      return list(rest, flags);
    case "deploy":
    case "push":
      return deploy(rest, flags);
    case "inspect":
    case "info":
      return inspect(rest, flags);
    case "logs":
    case "log":
      return logs(rest, flags);
    case "exec":
    case "invoke":
    case "run":
      return exec(rest, flags);
    case "rm":
    case "delete":
      return remove(rest, flags);
    default:
      error(`알 수 없는 fn 명령: ${sub}`);
      process.exitCode = 1;
  }
}

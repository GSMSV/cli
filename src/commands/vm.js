// vm 서브커맨드 — ls / inspect / start / stop / reboot / shutdown / create / rm / snapshot
import { request, ApiError } from "../api.js";
import {
  c, log, table, detail, success, info, warn, error,
  startSpinner, confirm, prompt, symbols,
} from "../ui.js";

const ACTIONS = ["start", "stop", "shutdown", "reboot"];

function fmtBytes(n) {
  if (!n) return "0";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)}${u[i]}`;
}

function statusBadge(status) {
  if (status === "running") return c.green("● running");
  if (status === "stopped") return c.gray("○ stopped");
  return c.yellow("◌ " + (status || "unknown"));
}

function fmtUptime(sec) {
  if (!sec) return "-";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

async function resolveVm(vmid) {
  const vms = await request("/vm/my-vms");
  const vm = vms.find((v) => String(v.vmid) === String(vmid));
  if (!vm) {
    throw new ApiError(404, `소유한 VM 중 #${vmid} 을(를) 찾을 수 없습니다. \`gsmsv vm ls\` 로 확인하세요.`);
  }
  return vm;
}

export async function list(args, flags) {
  const stop = startSpinner("VM 목록 불러오는 중");
  let vms;
  try {
    vms = await request("/vm/my-vms");
  } catch (e) {
    stop();
    throw e;
  }
  stop();

  if (flags.json) return log(JSON.stringify(vms, null, 2));
  if (vms.length === 0) {
    info("생성된 VM 이 없습니다. `gsmsv vm create` 로 만들 수 있습니다.");
    return;
  }
  table(
    ["VMID", "이름", "노드", "상태", "내부 IP", "만료"],
    vms.map((v) => [
      c.bold(String(v.vmid)),
      v.name || "-",
      v.node,
      statusBadge(v.status),
      v.internal_ip || "-",
      v.expires_at ? v.expires_at.slice(0, 10) : "-",
    ])
  );
  log(c.gray(`\n  ${vms.length}개 VM`));
}

export async function inspect(args, flags) {
  const vmid = args[0];
  if (!vmid) return error("사용법: gsmsv vm inspect <vmid>");
  const stop = startSpinner(`VM #${vmid} 조회 중`);
  try {
    const vm = await resolveVm(vmid);
    const s = await request(`/vm/${encodeURIComponent(vm.node)}/vms/${vmid}/status`);
    stop();
    if (flags.json) return log(JSON.stringify(s, null, 2));
    log(c.bold(`${s.name} `) + c.gray(`#${vmid}`) + "  " + statusBadge(s.status));
    log(c.gray("─".repeat(36)));
    detail([
      ["노드", s.node],
      ["공인 IP", s.public_ip || "-"],
      ["내부 IP", s.internal_ip || "-"],
      ["vCPU", String(s.cpus ?? "-")],
      ["메모리", `${fmtBytes(s.mem)} / ${fmtBytes(s.maxmem)}`],
      ["디스크", fmtBytes(s.maxdisk)],
      ["가동시간", fmtUptime(s.uptime)],
      ["생성일", s.created_at ? s.created_at.slice(0, 19) : "-"],
      ["만료일", s.expires_at ? s.expires_at.slice(0, 19) : "-"],
      ...(s.vm_password ? [["접속 비밀번호", c.yellow(s.vm_password)]] : []),
    ]);
    if (s.provisioning) warn("프로비저닝(cloud-init) 진행 중입니다. 잠시 후 접속하세요.");
  } catch (e) {
    stop();
    throw e;
  }
}

/** start/stop/reboot/shutdown 공통 */
export async function action(actionName, args) {
  const vmid = args[0];
  if (!vmid) return error(`사용법: gsmsv vm ${actionName} <vmid>`);
  const vm = await resolveVm(vmid);
  const stop = startSpinner(`#${vmid} ${actionName} 요청 중`);
  try {
    await request(`/vm/${encodeURIComponent(vm.node)}/vms/${vmid}/action`, {
      method: "POST",
      body: { action: actionName },
    });
    stop();
    success(`#${vmid} (${vm.name}) ${c.cyan(actionName)} 요청을 보냈습니다.`);
  } catch (e) {
    stop();
    throw e;
  }
}

export async function create(args, flags) {
  const tier = flags.tier || (await prompt("티어 (micro/small/medium/large) [micro]:")) || "micro";
  const os = flags.os || (await prompt("OS (ubuntu2204/windows-server) [ubuntu2204]:")) || "ubuntu2204";
  const name = flags.name || (await prompt("이름 (선택, 비우면 자동):")) || undefined;
  const node = flags.node || undefined;

  const body = { tier, os };
  if (name) body.name = name;
  if (node) body.node_name = node;
  if (flags.cores) body.custom_cores = Number(flags.cores);
  if (flags.memory) body.custom_memory = Number(flags.memory);
  if (flags.disk) body.custom_disk = Number(flags.disk);

  const stop = startSpinner("VM 생성 중 (프로비저닝까지 수 분 소요)");
  try {
    const res = await request("/vm/create", { method: "POST", body });
    stop();
    if (flags.json) return log(JSON.stringify(res, null, 2));
    success(`VM 생성 요청 완료${res?.vmid ? ` — #${res.vmid}` : ""}`);
    info("`gsmsv vm ls` 로 상태를, `gsmsv vm inspect <vmid>` 로 접속 정보를 확인하세요.");
  } catch (e) {
    stop();
    throw e;
  }
}

export async function remove(args, flags) {
  const vmid = args[0];
  if (!vmid) return error("사용법: gsmsv vm rm <vmid>");
  const vm = await resolveVm(vmid);
  if (!flags.yes) {
    const ok = await confirm(`정말 ${c.red(`#${vmid} (${vm.name})`)} 를 삭제할까요? 복구할 수 없습니다.`);
    if (!ok) return info("취소했습니다.");
  }
  const stop = startSpinner(`#${vmid} 삭제 중`);
  try {
    await request(`/vm/${encodeURIComponent(vm.node)}/vms/${vmid}`, { method: "DELETE" });
    stop();
    success(`#${vmid} (${vm.name}) 를 삭제했습니다.`);
  } catch (e) {
    stop();
    throw e;
  }
}

// ── 스냅샷 ────────────────────────────────────────────────
export async function snapshot(args, flags) {
  const sub = args[0];
  const vmid = args[1];
  if (!sub || !vmid) {
    return error(
      "사용법:\n" +
        "  gsmsv vm snapshot ls <vmid>\n" +
        "  gsmsv vm snapshot create <vmid> <이름> [--desc <설명>]\n" +
        "  gsmsv vm snapshot rollback <vmid> <이름>\n" +
        "  gsmsv vm snapshot rm <vmid> <이름>"
    );
  }
  const vm = await resolveVm(vmid);
  const path = `/vm/${encodeURIComponent(vm.node)}/vms/${vmid}/snapshots`;

  if (sub === "ls") {
    const snaps = await request(path);
    if (flags.json) return log(JSON.stringify(snaps, null, 2));
    const real = snaps.filter((s) => s.name !== "current");
    table(
      ["이름", "설명", "생성"],
      real.map((s) => [
        c.bold(s.name),
        s.description || "-",
        s.snaptime ? new Date(s.snaptime * 1000).toISOString().slice(0, 16).replace("T", " ") : "-",
      ])
    );
    return;
  }

  const snapName = args[2];
  if (!snapName) return error("스냅샷 이름이 필요합니다.");

  if (sub === "create") {
    await request(path, { method: "POST", body: { name: snapName, description: flags.desc || "" } });
    return success(`스냅샷 '${snapName}' 생성 완료.`);
  }
  if (sub === "rollback") {
    if (!flags.yes && !(await confirm(`'${snapName}' 시점으로 롤백할까요?`))) return info("취소했습니다.");
    await request(`${path}/${encodeURIComponent(snapName)}/rollback`, { method: "POST" });
    return success(`'${snapName}' 으로 롤백 완료.`);
  }
  if (sub === "rm") {
    await request(`${path}/${encodeURIComponent(snapName)}`, { method: "DELETE" });
    return success(`스냅샷 '${snapName}' 삭제 완료.`);
  }
  error(`알 수 없는 스냅샷 명령: ${sub}`);
}

/** vm 라우터 진입점 */
export async function run(args, flags) {
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case undefined:
    case "ls":
    case "list":
      return list(rest, flags);
    case "inspect":
    case "info":
    case "status":
      return inspect(rest, flags);
    case "start":
    case "stop":
    case "reboot":
    case "shutdown":
      return action(sub, rest);
    case "create":
    case "new":
      return create(rest, flags);
    case "rm":
    case "delete":
    case "destroy":
      return remove(rest, flags);
    case "snapshot":
    case "snap":
      return snapshot(rest, flags);
    default:
      // `gsmsv vm start 123` 외에 `gsmsv vm 123 start` 같은 실수 방지용 안내
      if (ACTIONS.includes(sub)) return action(sub, rest);
      error(`알 수 없는 vm 명령: ${sub}\n\`gsmsv help\` 를 참고하세요.`);
      process.exitCode = 1;
  }
}

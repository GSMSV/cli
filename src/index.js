#!/usr/bin/env node
import { parseArgs } from "node:util";
import { ApiError, setApiOverride } from "./api.js";
import { c, log, error } from "./ui.js";
import { getApiUrl } from "./config.js";

import * as auth from "./commands/auth.js";
import * as vm from "./commands/vm.js";
import * as fn from "./commands/fn.js";
import * as config from "./commands/config.js";

const VERSION = "0.1.0";

const OPTIONS = {
  // 전역
  api: { type: "string" },
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  yes: { type: "boolean", short: "y" },
  // login
  email: { type: "string" },
  password: { type: "string" },
  role: { type: "string" },
  datagsm: { type: "string" },
  // vm create
  tier: { type: "string" },
  os: { type: "string" },
  name: { type: "string" },
  node: { type: "string" },
  cores: { type: "string" },
  memory: { type: "string" },
  disk: { type: "string" },
  // snapshot
  desc: { type: "string" },
  // fn
  runtime: { type: "string" },
  data: { type: "string" },
  limit: { type: "string" },
  n: { type: "string" },
};

const HELP = `
${c.bold("gsmsv")} ${c.gray("— GSM SV 플랫폼 CLI")}  ${c.gray(`v${VERSION}`)}

${c.bold("사용법")}
  gsmsv <명령> [옵션]

${c.bold("인증")}
  login                  로그인 (--email --password --role user|project_owner|admin --datagsm true|false)
  logout                 로그아웃 (로컬 자격증명 삭제)
  whoami                 현재 로그인 정보

${c.bold("VM")}
  vm ls                  내 VM 목록
  vm inspect <vmid>      VM 상세/접속 정보
  vm start|stop|reboot|shutdown <vmid>
  vm create              VM 생성 (--tier --os --name --node [--cores --memory --disk])
  vm rm <vmid>           VM 삭제 (--yes 로 확인 생략)
  vm snapshot ls <vmid>
  vm snapshot create <vmid> <이름> [--desc <설명>]
  vm snapshot rollback|rm <vmid> <이름>

${c.bold("서버리스 함수")}
  fn ls                  함수 목록
  fn deploy <file>       함수 배포/갱신 (이름 기준 idempotent, gsmsv.json 지원)
  fn inspect <id|이름>
  fn exec <id|이름>      함수 실행 (--data '<json>')
  fn logs <id|이름>      실행 로그 (--limit N)
  fn rm <id|이름>

${c.bold("설정")}
  config ls              현재 설정 보기
  config set api <url>   백엔드 주소 변경 (예: http://localhost:8000)

${c.bold("전역 옵션")}
  --json                 결과를 JSON 으로 출력
  --api <url>            이번 실행에만 백엔드 주소 지정
  -y, --yes              확인 프롬프트 자동 승인
  -h, --help             도움말
  -v, --version          버전

${c.gray(`현재 백엔드: ${getApiUrl()}`)}
${c.gray("환경변수 GSMSV_API_URL 로도 백엔드 주소를 지정할 수 있습니다.")}
`;

async function main() {
  let parsed;
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      options: OPTIONS,
      allowPositionals: true,
      strict: false, // 알 수 없는 플래그도 통과 (관대하게)
    });
  } catch (e) {
    error(e.message);
    process.exitCode = 1;
    return;
  }

  const { values: flags, positionals } = parsed;
  const [cmd, ...rest] = positionals;

  if (flags.version) return log(`gsmsv v${VERSION}`);
  if (flags.help || !cmd || cmd === "help") return log(HELP);

  if (flags.api) setApiOverride(flags.api);

  try {
    switch (cmd) {
      case "login":
        return await auth.login(rest, flags);
      case "logout":
        return await auth.logout(rest, flags);
      case "whoami":
      case "me":
        return await auth.whoami(rest, flags);

      case "vm":
        return await vm.run(rest, flags);
      // 단축: 최상위에서 바로 ls / inspect
      case "ls":
        return await vm.list(rest, flags);
      case "inspect":
      case "status":
        return await vm.inspect(rest, flags);

      case "fn":
      case "function":
      case "functions":
        return await fn.run(rest, flags);
      case "deploy":
        return await fn.deploy(rest, flags);

      case "config":
        return await config.run(rest, flags);

      default:
        error(`알 수 없는 명령: ${cmd}`);
        log(c.gray("`gsmsv help` 로 사용법을 확인하세요."));
        process.exitCode = 1;
    }
  } catch (e) {
    if (e instanceof ApiError) {
      error(e.detail);
      if (e.status === 401) log(c.gray("→ `gsmsv login` 으로 다시 로그인하세요."));
    } else {
      error(e.message || String(e));
    }
    process.exitCode = 1;
  }
}

main();

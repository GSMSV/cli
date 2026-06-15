// config — API URL 등 CLI 설정 조회/변경
import { getConfig, setConfig, getApiUrl, CONFIG_DIR } from "../config.js";
import { c, log, success, info, error } from "../ui.js";

export async function run(args) {
  const [sub, key, value] = args;

  if (!sub || sub === "ls" || sub === "list") {
    const cfg = getConfig();
    log(c.bold("CLI 설정") + c.gray(`  (${CONFIG_DIR})`));
    log(`  ${c.gray("api".padEnd(8))} ${getApiUrl()}`);
    for (const [k, v] of Object.entries(cfg)) {
      if (k === "apiUrl") continue;
      log(`  ${c.gray(k.padEnd(8))} ${v}`);
    }
    return;
  }

  if (sub === "set") {
    if (key !== "api" || !value) return error("사용법: gsmsv config set api <url>");
    setConfig("apiUrl", value.replace(/\/+$/, ""));
    return success(`API URL 을 ${c.cyan(value)} 로 설정했습니다.`);
  }

  if (sub === "get") {
    if (key === "api") return log(getApiUrl());
    const cfg = getConfig();
    return log(cfg[key] ?? "");
  }

  error(`알 수 없는 config 명령: ${sub}`);
  process.exitCode = 1;
}

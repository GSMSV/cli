// login / logout / whoami
import { login as apiLogin, request, ApiError } from "../api.js";
import { saveAuth, clearAuth, getAuth, getApiUrl } from "../config.js";
import { c, log, success, info, error, prompt, promptPassword } from "../ui.js";

const ROLES = ["user", "project_owner", "admin"];

function parseBool(value, fallback = false) {
  if (value === undefined) return fallback;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new ApiError(1, "--datagsm must be true or false.");
}

export async function login(args, flags) {
  log(c.bold("GSM SV 로그인") + c.gray(`  (${getApiUrl(flags.api)})`));
  let datagsm;
  try {
    datagsm = parseBool(flags.datagsm, false);
  } catch (e) {
    error(e.detail);
    process.exitCode = 1;
    return;
  }
  const email = flags.email || (await prompt("이메일:"));
  const password = flags.password || (await promptPassword("비밀번호:"));

  try {
    if (datagsm) {
      return;
    }

    let role = flags.role || "user";
    if (!ROLES.includes(role)) {
      error(`알 수 없는 역할: ${role} (가능: ${ROLES.join(", ")})`);
      process.exitCode = 1;
      return;
    }

    const tokens = await apiLogin(email, password, role);
    saveAuth({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      role,
      email,
    });
    const me = await request("/auth/me").catch(() => null);
    success(`로그인 완료 — ${c.cyan(me?.name || email)} ${c.gray(`(${me?.role || role})`)}`);
  } catch (e) {
    if (e instanceof ApiError) error(e.detail);
    else error(e.message);
    process.exitCode = 1;
  }
}

export async function logout() {
  const auth = getAuth();
  if (!auth?.accessToken) {
    info("이미 로그아웃 상태입니다.");
    return;
  }
  // 서버 측 쿠키 무효화 시도 (Bearer 만으로는 무의미하지만 best-effort)
  await request("/auth/logout", { method: "POST" }).catch(() => {});
  clearAuth();
  success("로그아웃 완료. 로컬 자격증명을 삭제했습니다.");
}

export async function whoami() {
  try {
    const me = await request("/auth/me");
    log(c.bold(me.name || me.email));
    log(c.gray("─".repeat(28)));
    const rows = [
      ["이메일", me.email],
      ["역할", me.role],
      ["학번", me.grade && me.class_num ? `${me.grade}-${me.class_num}-${me.number}` : "-"],
      ["전공", me.major || "-"],
      ["프로젝트", me.project_name || "-"],
    ];
    for (const [k, v] of rows) log(`  ${c.gray(k.padEnd(8))} ${v}`);
  } catch (e) {
    error(e instanceof ApiError ? e.detail : e.message);
    process.exitCode = 1;
  }
}

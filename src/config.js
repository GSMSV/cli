import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from "node:fs";

const CONFIG_DIR = join(homedir(), ".gsmsv");
const AUTH_FILE = join(CONFIG_DIR, "auth.json");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const DEFAULT_API_URL = "https://gsmsv.site";

function ensureDir() {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, data) {
  ensureDir();
  writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  try {
    chmodSync(file, 0o600); 
  } catch {
    /* Windows 등에서 chmod 미지원 시 무시 */
  }
}

export function getApiUrl(override) {
  if (override) return stripSlash(override);
  if (process.env.GSMSV_API_URL) return stripSlash(process.env.GSMSV_API_URL);
  const cfg = readJson(CONFIG_FILE);
  if (cfg?.apiUrl) return stripSlash(cfg.apiUrl);
  return DEFAULT_API_URL;
}

function stripSlash(url) {
  return url.replace(/\/+$/, "");
}

export function getConfig() {
  return readJson(CONFIG_FILE) || {};
}

export function setConfig(key, value) {
  const cfg = getConfig();
  cfg[key] = value;
  writeJson(CONFIG_FILE, cfg);
  return cfg;
}

export function getAuth() {
  return readJson(AUTH_FILE);
}

export function saveAuth({ accessToken, refreshToken, role, email }) {
  writeJson(AUTH_FILE, {
    accessToken,
    refreshToken,
    role,
    email,
    apiUrl: getApiUrl(),
  });
}

export function clearAuth() {
  if (existsSync(AUTH_FILE)) writeJson(AUTH_FILE, {});
}

export { CONFIG_DIR, AUTH_FILE, DEFAULT_API_URL };

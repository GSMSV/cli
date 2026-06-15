import { getApiUrl, getAuth, saveAuth, clearAuth } from "./config.js";

const PREFIX = "/api/v1";

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

let apiOverride = null;
export function setApiOverride(url) {
  apiOverride = url;
}

function base() {
  return getApiUrl(apiOverride) + PREFIX;
}

async function parseBody(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function detailOf(body, fallback) {
  if (body && typeof body === "object" && body.detail) {
    return typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
  }
  if (typeof body === "string" && body) return body;
  return fallback;
}

export async function request(path, opts = {}) {
  const { method = "GET", body, form, query, auth = true } = opts;

  let url = base() + path;
  if (query) {
    const qs = new URLSearchParams(query).toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }

  const doFetch = (token) => {
    const headers = {};
    let payload;
    if (form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      payload = new URLSearchParams(form).toString();
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(url, { method, headers, body: payload });
  };

  const creds = auth ? getAuth() : null;
  if (auth && !creds?.accessToken) {
    throw new ApiError(401, "로그인이 필요합니다. `gsmsv login` 을 먼저 실행하세요.");
  }

  let res;
  try {
    res = await doFetch(creds?.accessToken);
  } catch (e) {
    throw new ApiError(0, `백엔드에 연결할 수 없습니다 (${base()}): ${e.message}`);
  }

  if (res.status === 401 && auth && creds?.refreshToken) {
    const refreshed = await tryRefresh(creds.refreshToken);
    if (refreshed) {
      res = await doFetch(refreshed);
    } else {
      clearAuth();
      throw new ApiError(401, "세션이 만료되었습니다. 다시 `gsmsv login` 하세요.");
    }
  }

  const data = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(res.status, detailOf(data, `요청 실패 (HTTP ${res.status})`));
  }
  return data;
}

async function tryRefresh(refreshToken) {
  try {
    const res = await fetch(base() + "/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const tokens = await res.json();
    const prev = getAuth() || {};
    saveAuth({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      role: prev.role,
      email: prev.email,
    });
    return tokens.access_token;
  } catch {
    return null;
  }
}

export async function login(email, password, role = "user") {
  const res = await fetch(base() + `/auth/login?login_role=${encodeURIComponent(role)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: email, password }).toString(),
  }).catch((e) => {
    throw new ApiError(0, `백엔드에 연결할 수 없습니다 (${base()}): ${e.message}`);
  });
  const data = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(res.status, detailOf(data, "로그인에 실패했습니다."));
  }
  return data; // { access_token, refresh_token, token_type }
}

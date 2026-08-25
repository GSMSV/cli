import { ApiError } from "./api.js";
import { getApiUrl } from "./config.js";

const GSMSV_PREFIX = "/api/v1";
const DATA_GSM_AUTH_BASE = "https://oauth.datagsm.kr";

function stripSlash(url) {
  return url.replace(/\/+$/, "");
}

function gsmsvBase(apiUrl) {
  return stripSlash(apiUrl || getApiUrl()) + GSMSV_PREFIX;
}

function header(res, name) {
  return res.headers.get(name);
}

function locationOf(res, step) {
  const location = header(res, "location");
  if (!location) {
    throw new ApiError(res.status, `${step} redirect location is missing.`);
  }
  return location;
}

async function parseJson(res, step) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(res.status, `${step} returned invalid JSON.`);
  }
}

async function expectRedirect(res, step) {
  if (![301, 302, 303, 307, 308].includes(res.status)) {
    throw new ApiError(res.status, `${step} redirect failed (HTTP ${res.status}).`);
  }
  return locationOf(res, step);
}

async function expectOk(res, step) {
  if (!res.ok) {
    throw new ApiError(res.status, `${step} failed (HTTP ${res.status}).`);
  }
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const setCookie = headers.get("set-cookie");
  return setCookie ? [setCookie] : [];
}

function splitCombinedSetCookie(value) {
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/g).map((v) => v.trim()).filter(Boolean);
}

function readCookie(setCookieHeaders, name) {
  for (const headerValue of setCookieHeaders.flatMap(splitCombinedSetCookie)) {
    const [cookie] = headerValue.split(";");
    const index = cookie.indexOf("=");
    if (index === -1) continue;
    if (cookie.slice(0, index).trim() === name) {
      return cookie.slice(index + 1);
    }
  }
  return null;
}

function tokenFromAuthorizeUrl(url) {
  const token = new URL(url).searchParams.get("token");
  if (!token) throw new ApiError(0, "DataGSM authorize token is missing.");
  return token;
}

function exchangeCodeFromCallbackUrl(url) {
  const code = new URL(url).searchParams.get("code");
  if (!code) throw new ApiError(0, "GSMSV exchange code is missing.");
  return code;
}

export async function login(email, password, opts = {}) {
  const base = gsmsvBase(opts.apiUrl);

  const entrance = await fetch(base + "/oauth/authorize", {
    method: "GET",
    redirect: "manual",
  });
  const dataGsmAuthorizeUrl = await expectRedirect(entrance, "GSMSV OAuth entrance");

  const authorizeInit = await fetch(dataGsmAuthorizeUrl, {
    method: "GET",
    redirect: "manual",
  });
  const accountInputUrl = await expectRedirect(authorizeInit, "DataGSM authorize init");
  const dataGsmToken = tokenFromAuthorizeUrl(accountInputUrl);

  const accountInput = await fetch(DATA_GSM_AUTH_BASE + "/api/oauth/authorize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: accountInputUrl,
    },
    body: JSON.stringify({ email, password, token: dataGsmToken }),
  });
  await expectOk(accountInput, "DataGSM account input");
  const accountData = await parseJson(accountInput, "DataGSM account input");
  if (!accountData?.redirect_url) {
    throw new ApiError(accountInput.status, "DataGSM redirect_url is missing.");
  }

  const callback = await fetch(accountData.redirect_url, {
    method: "GET",
    redirect: "manual",
  });
  const authCallbackUrl = await expectRedirect(callback, "GSMSV callback");
  const exchangeCode = exchangeCodeFromCallbackUrl(authCallbackUrl);

  const exchange = await fetch(base + "/oauth/exchange", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: stripSlash(opts.apiUrl || getApiUrl()),
      Referer: authCallbackUrl,
    },
    body: JSON.stringify({ code: exchangeCode }),
  });
  await expectOk(exchange, "GSMSV OAuth exchange");

  const setCookieHeaders = getSetCookieHeaders(exchange.headers);
  const accessToken = readCookie(setCookieHeaders, "access_token");
  const refreshToken = readCookie(setCookieHeaders, "refresh_token");
  if (!accessToken || !refreshToken) {
    throw new ApiError(exchange.status, "GSMSV OAuth exchange tokens are missing.");
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "bearer",
  };
}

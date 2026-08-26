import { ApiError } from "./api.js";
import { getApiUrl } from "./config.js";

const PREFIX = "/api/v1";
const DATA_GSM_AUTH_BASE = "https://oauth.datagsm.kr";
const REDIRECT_STATUS = [301, 302, 303, 307, 308];

function base(apiUrl) {
  return getApiUrl(apiUrl) + PREFIX;
}

function expectRedirect(res, step) {
  if (!REDIRECT_STATUS.includes(res.status)) {
    throw new ApiError(res.status, `${step} 리다이렉트에 실패했습니다 (HTTP ${res.status}).`);
  }
  const location = res.headers.get("location");
  if (!location) {
    throw new ApiError(res.status, `${step} 리다이렉트 위치(location)가 없습니다.`);
  }
  return location;
}

function expectOk(res, step) {
  if (!res.ok) {
    throw new ApiError(res.status, `${step} 요청에 실패했습니다 (HTTP ${res.status}).`);
  }
}

async function parseJson(res, step) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(res.status, `${step} 응답이 올바른 JSON 이 아닙니다.`);
  }
}

function setCookies(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const setCookie = headers.get("set-cookie");
  return setCookie ? [setCookie] : [];
}

function splitCookies(value) {
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/g).map((v) => v.trim()).filter(Boolean);
}

function readCookie(cookieHeaders, name) {
  for (const headerValue of cookieHeaders.flatMap(splitCookies)) {
    const [cookie] = headerValue.split(";");
    const index = cookie.indexOf("=");
    if (index === -1) continue;
    if (cookie.slice(0, index).trim() === name) {
      return cookie.slice(index + 1);
    }
  }
  return null;
}

function queryParam(url, name, message) {
  const value = new URL(url).searchParams.get(name);
  if (!value) throw new ApiError(0, message);
  return value;
}

export async function login(email, password, opts = {}) {
  const gsmsvBase = base(opts.apiUrl);
  const origin = getApiUrl(opts.apiUrl);

  const entrance = await fetch(gsmsvBase + "/oauth/authorize", {
    method: "GET",
    redirect: "manual",
  });
  const dataGsmAuthorizeUrl = expectRedirect(entrance, "GSMSV OAuth 진입");

  const authorizeInit = await fetch(dataGsmAuthorizeUrl, {
    method: "GET",
    redirect: "manual",
  });
  const accountInputUrl = expectRedirect(authorizeInit, "DataGSM authorize 초기화");
  const dataGsmToken = queryParam(accountInputUrl, "token", "DataGSM authorize 토큰이 없습니다.");

  const accountInput = await fetch(DATA_GSM_AUTH_BASE + "/api/oauth/authorize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: accountInputUrl,
    },
    body: JSON.stringify({ email, password, token: dataGsmToken }),
  });
  expectOk(accountInput, "DataGSM 계정 입력");
  const accountData = await parseJson(accountInput, "DataGSM 계정 입력");
  if (!accountData?.redirect_url) {
    throw new ApiError(accountInput.status, "DataGSM redirect_url 이 없습니다.");
  }

  const callback = await fetch(accountData.redirect_url, {
    method: "GET",
    redirect: "manual",
  });
  const authCallbackUrl = expectRedirect(callback, "GSMSV 콜백");
  const exchangeCode = queryParam(authCallbackUrl, "code", "GSMSV exchange 코드가 없습니다.");

  const exchange = await fetch(gsmsvBase + "/oauth/exchange", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Referer: authCallbackUrl,
    },
    body: JSON.stringify({ code: exchangeCode }),
  });
  expectOk(exchange, "GSMSV OAuth exchange");

  const cookies = setCookies(exchange.headers);
  const accessToken = readCookie(cookies, "access_token");
  const refreshToken = readCookie(cookies, "refresh_token");
  if (!accessToken || !refreshToken) {
    throw new ApiError(exchange.status, "GSMSV OAuth exchange 토큰이 없습니다.");
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "bearer",
  };
}
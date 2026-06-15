import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

const TTY = stdout.isTTY && !process.env.NO_COLOR;

function wrap(code) {
  return (s) => (TTY ? `\x1b[${code}m${s}\x1b[0m` : String(s));
}

export const c = {
  bold: wrap("1"),
  dim: wrap("2"),
  red: wrap("31"),
  green: wrap("32"),
  yellow: wrap("33"),
  blue: wrap("34"),
  magenta: wrap("35"),
  cyan: wrap("36"),
  gray: wrap("90"),
};

export const symbols = {
  ok: c.green("✓"),
  err: c.red("✗"),
  info: c.cyan("›"),
  warn: c.yellow("!"),
  arrow: c.gray("→"),
};

export function log(msg = "") {
  stdout.write(msg + "\n");
}
export function success(msg) {
  log(`${symbols.ok} ${msg}`);
}
export function info(msg) {
  log(`${symbols.info} ${msg}`);
}
export function warn(msg) {
  log(`${symbols.warn} ${c.yellow(msg)}`);
}
export function error(msg) {
  process.stderr.write(`${symbols.err} ${c.red(msg)}\n`);
}

function visibleLen(s) {
  return String(s).replace(/\x1b\[[0-9;]*m/g, "").length;
}

function pad(s, width) {
  const len = visibleLen(s);
  return s + " ".repeat(Math.max(0, width - len));
}

export function table(headers, rows) {
  if (rows.length === 0) {
    log(c.gray("  (없음)"));
    return;
  }
  const widths = headers.map((h, i) =>
    Math.max(visibleLen(h), ...rows.map((r) => visibleLen(r[i] ?? "")))
  );
  log("  " + headers.map((h, i) => c.gray(c.bold(pad(h, widths[i])))).join("   "));
  for (const row of rows) {
    log("  " + row.map((cell, i) => pad(cell ?? "", widths[i])).join("   "));
  }
}

export function detail(pairs) {
  const width = Math.max(...pairs.map(([k]) => visibleLen(k)));
  for (const [k, v] of pairs) {
    log(`  ${c.gray(pad(k, width))}  ${v}`);
  }
}

let spinnerTimer = null;
export function startSpinner(text) {
  if (!TTY) {
    stdout.write(`${text}...\n`);
    return () => {};
  }
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  stdout.write("\x1b[?25l"); // 커서 숨김
  spinnerTimer = setInterval(() => {
    stdout.write(`\r${c.cyan(frames[i++ % frames.length])} ${text}`);
  }, 80);
  return (finalLine) => {
    clearInterval(spinnerTimer);
    spinnerTimer = null;
    stdout.write("\r\x1b[K"); // 줄 지우기
    stdout.write("\x1b[?25h"); // 커서 복원
    if (finalLine) log(finalLine);
  };
}

export function prompt(question) {
  const rl = createInterface({ input: stdin, output: stdout });
  return new Promise((resolve) => {
    rl.question(`${c.cyan("?")} ${question} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function promptPassword(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout });
    const onData = (char) => {
      const s = char.toString("utf8");
      if (s === "\n" || s === "\r" || s === "") {
        stdin.removeListener("data", onData);
        return;
      }
      stdout.write("\x1b[2K\x1b[200D" + `${c.cyan("?")} ${question} `);
    };
    stdin.on("data", onData);
    rl.question(`${c.cyan("?")} ${question} `, (answer) => {
      stdin.removeListener("data", onData);
      rl.close();
      stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

/** y/N 확인 */
export async function confirm(question) {
  const a = await prompt(`${question} ${c.gray("(y/N)")}`);
  return /^y(es)?$/i.test(a);
}

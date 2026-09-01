#!/usr/bin/env node
import { spawn } from "node:child_process";

const rawArgs = process.argv.slice(2);
const args = [];
for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === "--host" || rawArgs[i] === "-h") {
    const nextVal = rawArgs[i + 1];
    if (nextVal && !nextVal.startsWith("-")) {
      args.push("-H", nextVal);
      i++;
    } else {
      args.push("-H", "0.0.0.0");
    }
  } else if (rawArgs[i].startsWith("--host=")) {
    args.push("-H", rawArgs[i].slice(7));
  } else {
    args.push(rawArgs[i]);
  }
}

if (!args.includes("-p") && !args.includes("--port")) {
  args.push("-p", "3000");
}
if (!args.includes("-H") && !args.includes("--hostname")) {
  args.push("-H", "0.0.0.0");
}

const child = spawn("next", ["dev", ...args], {
  stdio: "inherit",
  env: { ...process.env, PORT: "3000" },
});

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});

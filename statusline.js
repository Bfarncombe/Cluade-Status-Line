#!/usr/bin/env node
// Claude Code statusLine script — Tokyo Night edition.
// Reads the session JSON Claude Code pipes via stdin and prints one
// status line to stdout, colored with the Tokyo Night palette.

const { execSync } = require("child_process");

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

// truecolor helpers
const fg = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;

// Tokyo Night palette
const TOKYO = {
  blue: fg(122, 162, 247), // #7aa2f7 — model, project
  cyan: fg(125, 207, 255), // #7dcfff
  green: fg(158, 206, 106), // #9ece6a — low context usage
  yellow: fg(224, 175, 104), // #e0af68 — medium context usage
  red: fg(247, 118, 142), // #f7768e — high context usage, dirty
  magenta: fg(187, 154, 247), // #bb9af7 — branch
  gray: fg(86, 95, 137), // #565f89 — comments/dim text
};

function truncate(str, max) {
  if (!str) return str;
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

function fmtDuration(ms) {
  if (!ms || ms < 0) return null;
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h${m}m`;
  if (m > 0) return `${m}m`;
  return `${totalSec}s`;
}

function usageTheme(usedPct) {
  if (usedPct >= 80) return TOKYO.red;
  if (usedPct >= 50) return TOKYO.yellow;
  return TOKYO.green;
}

function gaugeBar(usedPct, width = 10) {
  const filled = Math.max(0, Math.min(width, Math.round((usedPct / 100) * width)));
  let bar = "";
  for (let i = 0; i < width; i++) {
    if (i < filled) {
      const usedAtCell = ((i + 1) / width) * 100;
      bar += `${usageTheme(usedAtCell)}▓${RESET}`;
    } else {
      bar += `${DIM}${TOKYO.gray}░${RESET}`;
    }
  }
  return bar;
}

function repoName(data) {
  const repo = data.workspace?.repo;
  if (repo?.name) return repo.name;
  const dir = data.workspace?.project_dir || data.workspace?.current_dir || data.cwd || "";
  const parts = dir.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] || "unknown-repo";
}

function gitInfo(dir) {
  if (!dir) return null;
  // Windows + AV makes git slow; 300ms killed it mid-call and dropped the branch entirely.
  const opts = { cwd: dir, stdio: ["ignore", "pipe", "ignore"], timeout: 3000 };
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", opts).toString().trim();
    let dirty = false;
    try {
      const status = execSync("git status --porcelain", opts).toString();
      dirty = status.trim().length > 0;
    } catch {
      // ignore — treat as clean if status check fails
    }
    return { branch, dirty };
  } catch {
    return null; // not a git repo, or git unavailable
  }
}

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let data = {};
  try {
    data = JSON.parse(input);
  } catch {
    // fall through with empty data if stdin wasn't valid JSON
  }

  const modelName = data.model?.display_name || data.model?.id || "unknown model";
  const modelSegment = `${TOKYO.blue}${modelName}${RESET}`;

  const ctx = data.context_window;
  const remainingPct = ctx?.remaining_percentage;
  const usedPct =
    typeof ctx?.used_percentage === "number"
      ? ctx.used_percentage
      : typeof remainingPct === "number"
      ? 100 - remainingPct
      : 0;

  const color = usageTheme(usedPct);
  const ctxSegment = `${gaugeBar(usedPct)} ${color}${Math.round(usedPct)}%${RESET}`;

  const projectDir = data.workspace?.project_dir || data.workspace?.current_dir || data.cwd;
  const repo = truncate(repoName(data), 24);
  const git = gitInfo(projectDir);
  const dirtyPart = git?.dirty ? ` ${TOKYO.red}*${RESET}` : ` ${TOKYO.green}✓${RESET}`;
  const added = data.cost?.total_lines_added;
  const removed = data.cost?.total_lines_removed;
  const linesPart =
    typeof added === "number" || typeof removed === "number"
      ? ` ${TOKYO.green}+${added || 0}${RESET}${TOKYO.gray}/${RESET}${TOKYO.red}-${removed || 0}${RESET}`
      : "";
  const projectSegment = `${TOKYO.blue}${repo}${RESET}`;
  const branchSegment = git ? `${TOKYO.magenta}${git.branch}${RESET}${dirtyPart}${linesPart}` : null;

  const duration = fmtDuration(data.cost?.total_duration_ms);
  const durationSegment = duration ? `${TOKYO.gray}${duration}${RESET}` : null;

  const segments = [modelSegment, ctxSegment, projectSegment, branchSegment, durationSegment].filter(Boolean);

  const line = segments.join(`  `);

  process.stdout.write(line + "\n");
});

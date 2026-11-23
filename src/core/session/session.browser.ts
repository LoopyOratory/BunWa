import * as fs from 'fs';

//
// Browser executable path detection
//

// Ordered: Chrome paths first, then Chromium.
// Windows: only global Program Files paths (no per-user %LOCALAPPDATA%).
const BROWSER_PATHS: Record<string, string[]> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Chromium\\Application\\chrome.exe',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ],
};

export function getBrowserExecutablePath(): string {
  // Explicit override wins first (CHROME_PATH, then PUPPETEER_EXECUTABLE_PATH)
  // so containers and dev boxes can point at the Chrome the image ships.
  // The WEBJS engine launches this same path — one resolution order for both
  // the manager's pre-flight check and the engine itself.
  const override = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (override) {
    return override;
  }

  // Prefer the headless shell binary — it uses ~half the memory of full
  // Chrome (209 MB vs 376 MB) and starts 2x faster. Fall back to regular
  // Chrome if the shell binary is not available.
  const shellCandidates = [];
  try {
    const cacheDir = process.env.HOME ? `${process.env.HOME}/.cache/ms-playwright` : '';
    if (cacheDir && fs.existsSync(cacheDir)) {
      const entries = fs.readdirSync(cacheDir);
      for (const entry of entries) {
        if (entry.startsWith('chromium_headless_shell-')) {
          const shellPath = `${cacheDir}/${entry}/chrome-headless-shell-linux64/chrome-headless-shell`;
          if (fs.existsSync(shellPath)) {
            shellCandidates.push(shellPath);
          }
        }
      }
    }
  } catch {
    // ignore
  }
  shellCandidates.push('/usr/bin/chrome-headless-shell');
  shellCandidates.push('/usr/bin/chromium-headless-shell');

  for (const p of shellCandidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Fall back to regular Chrome/Chromium
  const paths = BROWSER_PATHS[process.platform] ?? BROWSER_PATHS['linux'];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return paths[0];
}

// A path belongs to Google Chrome when it contains "google" in any casing.
// All Chrome paths include "Google" (macOS/Windows) or "google-chrome" (Linux),
// while Chromium paths never do.
export function isChromeExecutablePath(executablePath: string): boolean {
  return executablePath.toLowerCase().includes('google');
}
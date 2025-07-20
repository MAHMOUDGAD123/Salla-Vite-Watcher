import path from "path";
import fs, { promises as fsPromises } from "fs";

/**
 * A custom logger
 * @param msg a string message to log
 * @param type mode color
 */
export function logger(
  msg: string,
  type: "info" | "success" | "warning" | "error" | "debug"
) {
  const map = new Map([
    ["info", 46],
    ["success", 42],
    ["warning", 43],
    ["error", 41],
    ["debug", 45],
  ]);

  // if (type === "debug" && !process.env.DEBUG) return;

  const col = map.get(type)!;

  console.log(
    `\n\x1b[1m\x1b[${col}m SALLA VITE \x1b[0m \x1b[30m[${new Date().toLocaleTimeString()}]\x1b[0m \x1b[${
      col - 10
    }m${msg}\x1b[0m`
  );
}

/**
 * Extract the name of the file from the file path
 * @param file the file path
 * @returns
 */
export function getFileName(file: string) {
  return path.basename(file).split(".")[0];
}

/**
 * Recursively scan a directory and return all file paths (relative to the rootDir).
 */
export function getAllFiles(dir: string, rootDir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(filePath, rootDir));
    } else {
      results.push(path.relative(rootDir, filePath));
    }
  });
  return results;
}

/**
 * Get the relative path `from` directory
 * @param file file full path
 * @example "D:\Salla\themes\src\assets\js\app.js" => "src/assets/js/app.js"
 * @example "D:\Salla\themes\public\app.js" => "public/app.js"
 */
export function relativePath(from: "src" | "public", file: string) {
  return from + file.split(from)[1]!.replaceAll("\\", "/");
}

/** Ensure a directory exists (recursive). */
export async function ensureDir(dir: string) {
  await fsPromises.mkdir(dir, { recursive: true });
}

/**
 * Remove the folder and recursively deletes all files and subdirectories.
 * @param folderPath the folder path
 */
export async function removeFolder(folderPath: string) {
  await fsPromises.rm(folderPath, { recursive: true, force: true });
}

/**
 * Recursively deletes all files and subdirectories in the given folder.
 * Does not delete the folder itself.
 */
export async function clearFolder(folderPath: string): Promise<void> {
  try {
    const entries = await fsPromises.readdir(folderPath, {
      withFileTypes: true,
    });
    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(folderPath, entry.name);
        if (entry.isDirectory()) {
          await clearFolder(fullPath);
          await fsPromises.rmdir(fullPath);
        } else {
          await fsPromises.unlink(fullPath);
        }
      })
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`Failed to clear folder ${folderPath}:`, e);
    }
  }
}

/**
 * Recursively copy all files and folders from src to dest.
 */
export async function copyDir(src: string, dest: string) {
  await fsPromises.mkdir(dest, { recursive: true });
  const entries = await fsPromises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fsPromises.copyFile(srcPath, destPath);
    }
  }
}

export function isFileInsideFolder(filePath: string, folderPath: string) {
  return filePath.startsWith(folderPath + "/");
}

export function formatDuration(ms: number) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  const seconds = (ms / 1000).toFixed(2);
  return `${seconds}s`;
}

/**
 * Format file size in human readable format
 * @param bytes file size in bytes
 * @returns formatted size string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function waitFor(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Timer
export class Timer {
  #start: number;

  constructor() {
    this.#start = performance.now();
  }

  get duration(): string {
    return formatDuration(performance.now() - this.#start);
  }
}

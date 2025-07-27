import path from "path";
import {
  scriptDepsEntriesMap,
  scriptEntriesDepsMap,
  SRC,
  SRC_STYLES,
} from "./globals.ts";
import { getAllFiles } from "./tools.ts";

/**
 * Excute a list of promises in parallel asynchronously.
 * @param promisesList the promises list
 */
export function excuteInParallel(promisesList: Promise<unknown>[]) {
  return Promise.allSettled(promisesList);
}

/**
 * Generate a Vite input object for a style file in the source directory,
 * mapping it to a target directory, preserving structure.
 */
export function generateStyleRollupEntry(
  filePath: string
): Record<string, string> {
  const relPath = path.relative(SRC_STYLES, filePath);
  const outPath = path.join("styles", relPath).replace(/\\/g, "/");
  return { [outPath.replace(/\.[^/.]+$/, "")]: filePath };
}

/**
 * Generate a Vite input object for all style files in a source directory,
 * mapping them to a target directory, preserving structure.
 */
export function generateStylesRollupEntries(
  srcDir: string
): Record<string, string> {
  const absSrcDir = path.resolve(process.cwd(), srcDir);
  const files = getAllFiles(absSrcDir, absSrcDir);
  const entries: Record<string, string> = {};
  for (const relFile of files) {
    const absFile = path.join(absSrcDir, relFile);
    if (relFile === "app.scss") {
      // ignore `/src/assets/styles/app.scss`
      continue;
    }
    const outPath = path.join("styles", relFile).replace(/\\/g, "/");
    entries[outPath.replace(/\.[^/.]+$/, "")] = absFile;
  }
  return entries;
}

/**
 * This function used to fill the (scriptEntriesDepsMap) by adding the dependencies for each salla entry to used it as a reference to figure out
 * if any future updates in these dependencies should trigger a rebuild for the entry or not (🐂💩 right).
 * @param dependencyPath the path of the dependency
 * @param entryName the name of salla entry
 */
export function addToScriptEntriesDeps(
  dependencyPath: string,
  entryName: SallaScriptEntryName
) {
  scriptEntriesDepsMap[entryName].add(dependencyPath);
}

/**
 * - This function will clear the Set of the entry to prepare it to reserve a new Set of deps.
 * - This happen on every rebuild for the entry.
 * @param entryName the fkn entry name
 */
export function clearScriptEntriesDeps(entryName: SallaScriptEntryName) {
  scriptEntriesDepsMap[entryName].clear();
}

/**
 * This function used to fill the (scriptDepsEntriesMap) by adding all entries that depends on this dependency
 * @param dependencyPath the path of the dependency
 * @param entryName the name of salla entry
 */
export function addToScriptDepsEntries(
  dependencyPath: string,
  entryName: SallaScriptEntryName
) {
  // Add new if not exists and ignore if exists 😎💩 - what a great operator (??) 💘.
  (scriptDepsEntriesMap[dependencyPath] ??= new Set()).add(entryName);
}

/**
 * Get the Set of entries for a dependency if exists.
 * @param dependencyPath the path of the dependency
 */
export function getScriptFileRebuildEntries(dependencyPath: string) {
  return scriptDepsEntriesMap[dependencyPath] ?? null;
}

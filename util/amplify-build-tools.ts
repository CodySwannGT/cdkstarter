/** Exact, opt-in executable installation and verification for Amplify builds. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AmplifyBuildTool } from "../lib/types";

/** Single source of executable versions; never use host dependency ranges. */
export interface BuildToolManifest {
  /** Alternative version sources are prohibited for selected tools. */
  readonly devDependencies?: Readonly<Record<string, string>>;
  /** Exact versions indexed by npm package name. */
  readonly dependencies: Readonly<Record<string, string>>;
}

/**
 * Render selected generic npm executable adapters; no tool is selected by default.
 * @param tools - Explicit package/executable bindings, without duplicate versions
 * @param manifest - Exact manifest, normally read from config/amplify-build-tools
 * @returns Shell commands that install mismatched tools and verify the pin again
 */
export const renderBuildToolCommands = (
  tools: readonly AmplifyBuildTool[] = [],
  manifest?: BuildToolManifest
): string[] => {
  if (tools.length === 0) return [];
  const pins: BuildToolManifest =
    manifest ??
    JSON.parse(
      readFileSync(
        join(__dirname, "../config/amplify-build-tools/package.json"),
        "utf8"
      )
    );
  return tools.map((tool, index) => {
    const version = pins.dependencies?.[tool?.packageName];
    if (pins.devDependencies?.[tool?.packageName] !== undefined)
      throw new Error(
        "Build tools have duplicate sources of version truth; use only manifest dependencies."
      );
    if (
      !tool ||
      typeof tool.packageName !== "string" ||
      typeof tool.executable !== "string" ||
      Object.keys(tool).some(
        key => !["packageName", "executable"].includes(key)
      ) ||
      !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(
        tool.packageName
      ) ||
      !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(tool.executable)
    )
      throw new Error(
        "Build tools require safe package and executable names with versions only in the manifest."
      );
    if (
      tools
        .slice(0, index)
        .some(
          previous =>
            previous.packageName === tool.packageName ||
            previous.executable === tool.executable
        )
    )
      throw new Error(
        "Build tools contain duplicate package or executable bindings."
      );
    const semver =
      typeof version === "string"
        ? /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.exec(
            version
          )
        : null;
    const identifiers = semver?.[4]?.slice(1).split(".") ?? [];
    if (
      !semver ||
      identifiers.some(
        part =>
          !part ||
          (/^\d+$/.test(part) && part.length > 1 && part.startsWith("0"))
      ) ||
      (semver[5] !== undefined &&
        semver[5]
          .slice(1)
          .split(".")
          .some(part => !part))
    ) {
      throw new Error(
        "Build tool manifest versions must be exact semver pins."
      );
    }
    const prefix = `$PWD/.amplify-build-tools/${tool.executable}`;
    const check = `( detected="$(${tool.executable} --version 2>/dev/null)" && [ "\${detected#v}" = '${version}' ] )`;
    return `if ! command -v ${tool.executable} >/dev/null 2>&1 || ! ${check}; then npm install --prefix "${prefix}" --no-save --no-audit --no-fund '${tool.packageName}@${version}' && export PATH="${prefix}/node_modules/.bin:$PATH" && hash -r; fi; ${check} || { echo 'Build tool version mismatch: ${tool.executable}' >&2; exit 1; }`;
  });
};

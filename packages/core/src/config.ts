import { existsSync, readFileSync, globSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import YAML from "yaml";
import { registerTheme, ThemeDef } from "./themes/index.js";
import { parseThemeDef } from "./themes/schema.js";
import { configureIcons } from "./icons/store.js";

export interface ProjectConfig {
  /** Default theme name for the project. */
  theme?: string;
  /** Globs (relative to the config file) of `*.theme.yaml|json` files to register. */
  themes?: string[];
  /** Custom icon packs: `[{ prefix: "my", dir: "./icons" }]`. */
  icons?: { prefix: string; dir: string; monochrome?: boolean }[];
  /** Where synced official packs live (default: `.dgm/icons`, searched upwards). */
  iconsDir?: string;
  /** Folder where you drop the official icon zips for `dgm icons update` (default: `icons-inbox`). */
  iconsInbox?: string;
}

export interface LoadedConfig {
  root: string;
  file?: string;
  config: ProjectConfig;
  themes: ThemeDef[];
}

export function loadThemeFile(path: string): ThemeDef {
  const def = parseThemeDef(YAML.parse(readFileSync(path, "utf8")), path);
  return def;
}

/** Find `dgm.config.json` walking up from `start`; register the project's themes. Safe to call repeatedly. */
export function loadConfig(start: string = process.cwd()): LoadedConfig {
  let dir = resolve(start);
  let file: string | undefined;
  for (;;) {
    const f = join(dir, "dgm.config.json");
    if (existsSync(f)) {
      file = f;
      break;
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  const root = file ? dirname(file) : resolve(start);
  const config: ProjectConfig = file ? JSON.parse(readFileSync(file, "utf8")) : {};
  const themes: ThemeDef[] = [];
  configureIcons({ root, iconsDir: config.iconsDir, custom: config.icons });
  for (const pattern of config.themes ?? []) {
    for (const p of globSync(pattern, { cwd: root })) {
      const def = loadThemeFile(resolve(root, p));
      registerTheme(def);
      themes.push(def);
    }
  }
  return { root, file, config, themes };
}

import moment from "moment";

export { moment };

export class TFile {
  path: string;
  basename: string;
  extension: string;
  parent: { path: string } | null;

  constructor(path: string) {
    this.path = path;
    const slash = path.lastIndexOf("/");
    const name = path.slice(slash + 1);
    const dot = name.lastIndexOf(".");
    this.basename = dot === -1 ? name : name.slice(0, dot);
    this.extension = dot === -1 ? "" : name.slice(dot + 1);
    this.parent = { path: slash === -1 ? "/" : path.slice(0, slash) };
  }
}

export const notices: string[] = [];

export class Notice {
  constructor(message: string) {
    notices.push(message);
  }
}

export function normalizePath(path: string): string {
  return path.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
}

export class PluginSettingTab {}
export class Setting {}

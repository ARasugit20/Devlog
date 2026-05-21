import * as path from 'path';

type Configuration = {
  values: Record<string, unknown>;
  get: <T>(key: string, defaultValue?: T) => T;
  update: (key: string, value: unknown) => Promise<void>;
};

const configuration: Configuration = {
  values: {},
  get<T>(key: string, defaultValue?: T): T {
    return (this.values[key] as T | undefined) ?? (defaultValue as T);
  },
  async update(key: string, value: unknown): Promise<void> {
    this.values[key] = value;
  },
};

export const workspace = {
  workspaceFolders: [] as Array<{ uri: { fsPath: string } }>,
  getConfiguration(): Configuration {
    return configuration;
  },
  fs: {
    async readFile(uri: { fsPath: string }): Promise<Uint8Array> {
      const fs = await import('fs/promises');
      return fs.readFile(uri.fsPath);
    },
    async createDirectory(uri: { fsPath: string }): Promise<void> {
      const fs = await import('fs/promises');
      await fs.mkdir(uri.fsPath, { recursive: true });
    },
  },
};

export const Uri = {
  file(fsPath: string): { fsPath: string } {
    return { fsPath };
  },
  joinPath(base: { fsPath: string }, ...segments: string[]): { fsPath: string } {
    return { fsPath: path.join(base.fsPath, ...segments) };
  },
  parse(value: string): { toString: () => string } {
    return { toString: () => value };
  },
};

export const window = {
  async showInformationMessage(): Promise<undefined> {
    return undefined;
  },
  async showWarningMessage(): Promise<undefined> {
    return undefined;
  },
  async showInputBox(): Promise<undefined> {
    return undefined;
  },
  setStatusBarMessage(): { dispose: () => void } {
    return { dispose: () => undefined };
  },
  registerWebviewViewProvider(): { dispose: () => void } {
    return { dispose: () => undefined };
  },
};

export const commands = {
  registerCommand(): { dispose: () => void } {
    return { dispose: () => undefined };
  },
};

export const env = {
  async openExternal(): Promise<boolean> {
    return true;
  },
};

export const ConfigurationTarget = {
  Global: 1,
};

export function __setConfiguration(values: Record<string, unknown>): void {
  configuration.values = { ...values };
}

export function __setWorkspaceFolders(paths: string[]): void {
  workspace.workspaceFolders = paths.map((fsPath) => ({ uri: { fsPath } }));
}

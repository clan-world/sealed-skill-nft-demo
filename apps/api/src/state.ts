import fs from 'node:fs/promises';
import path from 'node:path';
import { addLog, createEmptyDemoState } from '@sealed-skill/demo-state';
import type { DemoState } from '@sealed-skill/protocol';

export class StateStore {
  constructor(private readonly file: string) {}

  async read(): Promise<DemoState> {
    try {
      return JSON.parse(await fs.readFile(this.file, 'utf8')) as DemoState;
    } catch {
      return createEmptyDemoState();
    }
  }

  async write(state: DemoState): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(state, null, 2));
  }

  async update(fn: (state: DemoState) => DemoState | Promise<DemoState>): Promise<DemoState> {
    const current = await this.read();
    const next = await fn(current);
    await this.write(next);
    return next;
  }

  async log(message: string): Promise<DemoState> {
    return this.update((state) => addLog(state, message));
  }
}

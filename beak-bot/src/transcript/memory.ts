import { Line, RecentOptions, Transcript, isCommand } from './index.js';

// The second adapter at the transcript seam. It exists so a plugin can be
// exercised without a live database: hand it the lines you want the plugin to
// see and assert on what the plugin does with them.
export class MemoryTranscript implements Transcript {
  // Lines are stored oldest first, the same order recent() hands back.
  constructor(private lines: Map<string, Line[]> = new Map()) {}

  append(channel: string, line: Line) {
    const existing = this.lines.get(channel) ?? [];
    existing.push(line);
    this.lines.set(channel, existing);
  }

  async recent(channel: string, limit: number, options: RecentOptions = {}): Promise<Line[]> {
    const lines = (this.lines.get(channel) ?? []).filter((line) => !isCommand(line.text));
    const visible = options.excluding
      ? lines.filter((line) => line.sender !== options.excluding)
      : lines;

    // slice(-limit) on an empty limit would return the whole array, so guard.
    return limit <= 0 ? [] : visible.slice(-limit);
  }
}

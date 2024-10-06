import PQueue from 'p-queue';
import { BasePlugin, PluginContext } from '../plugins/index.js';
import { BeakMessage } from './beak.js';

export interface BotSettings {
  nick: string;
  channel: string;
}

export abstract class BaseBot {
  protected plugins: BasePlugin[] = [];
  protected queue = new PQueue({ concurrency: 1 });

  get nick() {
    return this.settings.nick;
  }

  get channel() {
    return this.settings.channel;
  }

  constructor(private settings: BotSettings) {}

  public async addPlugin(plugin: BasePlugin) {
    this.plugins.push(plugin);
  }

  protected async runPlugins(context: PluginContext): Promise<void> {
    const runNext = async (index: number): Promise<void> => {
      if (index < this.plugins.length) {
        const plugin = this.plugins[index];
        await plugin?.process(context, () => runNext(index + 1));
      }
    };

    await runNext(0);
  }

  protected async addMessage(message: BeakMessage) {
    // Notify plugins of the message.
    await this.queue.add(async () => {
      await this.runPlugins({
        message
      });
    });
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(type: 'public' | 'private', recipient: string, content: string): Promise<void>;
}

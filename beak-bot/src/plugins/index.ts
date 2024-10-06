import { BeakMessage } from '../bots/beak.js';
import { BaseBot } from '../bots/index.js';

export interface PluginContext {
  message: BeakMessage;
}

export abstract class BasePlugin {
  constructor(protected bot: BaseBot) {}

  abstract process(context: PluginContext, next?: () => Promise<void>): Promise<void>;
}

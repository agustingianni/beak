import { BaseBot } from '../bots/index.js';
import { error, info } from '../logging/index.js';
import { Personality } from '../models/index.js';
import { BasePlugin, PluginContext } from './index.js';

export class PersonalityPlugin extends BasePlugin {
  constructor(bot: BaseBot) {
    super(bot);
  }

  async process(context: PluginContext, next: () => Promise<void>) {
    const { message } = context;

    if (message.sender === this.bot.nick) {
      return next();
    }

    const match = message.content.match(/^!personality\s+(\S+)(?:\s+(.+))?$/);
    if (!match) {
      return next();
    }

    const subcommand = match[1]!.trim();
    const args = match[2]?.trim();

    switch (subcommand) {
      case 'show':
        await this.bot.send(
          'private',
          message.sender,
          'This is my current personality:\n' + this.bot.personality.template.join('\n')
        );
        break;

      case 'add':
        if (args) {
          info(`Adding to personality: ${args}`);
          this.bot.personality = new Personality([...this.bot.personality.template, args]);
        }
        break;

      case 'set':
        if (args) {
          info(`Setting new personality: ${args}`);
          this.bot.personality = new Personality([args]);
        }
        break;

      case 'help':
        await this.bot.send(
          'private',
          message.sender,
          `Available personality commands:\n` +
            `- show: Show the current personality.\n` +
            `- add <trait>: Add a new personality trait.\n` +
            `- set <personality>: Overwrite with a new personality.\n` +
            `- help: Show this list of commands.`
        );
        break;

      default:
        error(`Unknown personality command: ${subcommand}`);
        break;
    }

    return next();
  }
}

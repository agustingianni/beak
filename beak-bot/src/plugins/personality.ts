import { BaseBot } from '../bots/index.js';
import { error, info } from '../logging/index.js';
import { Personality } from '../models/index.js';
import { BasePlugin, PluginContext } from './index.js';

export class PersonalityPlugin extends BasePlugin {
  // A whole IRC line is 512 bytes including the ":nick!user@host PRIVMSG
  // #channel :" envelope, so a command much past this either arrives truncated
  // or gets split, and the tail lands as a second message we never see.
  private readonly TRUNCATION_RISK = 350;

  constructor(bot: BaseBot) {
    super(bot);
  }

  // set and add used to change the personality without saying anything, so a
  // command that was silently cut in transit looked exactly like one that
  // worked. Always confirm, and say what actually arrived.
  private async report(sender: string, rawCommand: string, personality: Personality) {
    const lines = personality.template.length;
    await this.bot.send(
      'private',
      sender,
      `Personality is now ${lines} line${lines === 1 ? '' : 's'}, ` +
        `${personality.template.join(' ').length} characters. Use "!personality show" to read it back.`
    );

    if (rawCommand.length >= this.TRUNCATION_RISK) {
      await this.bot.send(
        'private',
        sender,
        `Careful: that command was ${rawCommand.length} characters, close to the IRC line limit, ` +
          `so the end may have been cut off before it reached me. ` +
          `Check with "!personality show", and prefer several short "!personality add" lines.`
      );
    }
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
          await this.report(message.sender, message.content, this.bot.personality);
        } else {
          await this.bot.send('private', message.sender, 'Nothing to add. Give me a trait.');
        }
        break;

      case 'set':
        if (args) {
          info(`Setting new personality: ${args}`);
          this.bot.personality = new Personality([args]);
          await this.report(message.sender, message.content, this.bot.personality);
        } else {
          await this.bot.send('private', message.sender, 'Nothing to set. Give me a personality.');
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

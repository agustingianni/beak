import chalk from 'chalk';
import { BaseBot } from '../bots/index.js';
import { Database, Message } from '../database/index.js';
import { debug, error } from '../logging/index.js';
import { OutputMessage } from '../utilities/messages.js';
import { BasePlugin, PluginContext } from './index.js';

export class ShitpostPlugin extends BasePlugin {
  private readonly CONTEXT_SIZE = 16;
  private readonly INACTIVITY_THRESHOLD_HOURS = 4;
  private timestamp: number = Date.now();

  constructor(bot: BaseBot) {
    super(bot);
    this.startInactivityTimer();
  }

  private startInactivityTimer() {
    const check = async () => {
      const delta = (Date.now() - this.timestamp) / (1000 * 60 * 60);
      if (delta >= this.INACTIVITY_THRESHOLD_HOURS) {
        debug(chalk.yellow(`No activity detected for ${delta.toFixed(2)} hours.`));
        await this.interact();
        this.updateLastMessageTime();
      }
    };

    setInterval(check, 60 * 1000);
  }

  private updateLastMessageTime() {
    this.timestamp = Date.now();
  }

  async process(_context: PluginContext, next: () => Promise<void>) {
    this.updateLastMessageTime();
    return next();
  }

  async interact() {
    try {
      const context = await Database.getRepository(Message).find({
        where: { channel: { name: this.bot.channel } },
        order: { id: 'DESC' },
        take: this.CONTEXT_SIZE,
        relations: ['sender', 'channel']
      });

      context.reverse();

      debug(chalk.redBright(`Preparing interaction with context:`));
      for (const message of context) {
        debug(chalk.redBright(`  * ${message.sender.name}: ${message.data}`));
      }

      const conversation = context.slice(0, context.length - 1);
      const prompt = [
        '### Your Personality',
        ...this.bot.personality.template,
        '',
        '### IRC Logs',
        ...conversation.map((message) => `${message.sender.name}: "${message.data}"`),
        '',
        '### Instructions',
        `You are ${this.bot.nick}.`,
        `The channel has been quiet for a while.`,
        `Craft a short, witty, or interesting message to get the conversation going again.`,
        `Your message should be in character with your personality and could be a random thought, a joke, or a comment related to the last conversation topics.`
      ];

      const start = Date.now();
      const response = await this.bot.agent.query(prompt);
      const end = Date.now();
      debug(`Response generated in ${end - start}ms`);

      if (!response.includes('\n')) {
        debug(chalk.greenBright(response));
      } else {
        debug(chalk.redBright(response));
      }

      await this.bot.send(
        'public',
        this.bot.channel,
        OutputMessage.cleanup(response, this.bot.nick)
      );
    } catch (err) {
      error('Error during interaction:', err);
    }
  }
}

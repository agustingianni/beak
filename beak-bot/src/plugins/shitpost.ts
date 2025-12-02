import chalk from 'chalk';
import { BaseBot } from '../bots/index.js';
import { Database, Message } from '../database/index.js';
import { debug, error } from '../logging/index.js';
import { OutputMessage } from '../utilities/messages.js';
import { BasePlugin, PluginContext } from './index.js';
import { Not } from 'typeorm';

export class ShitpostPlugin extends BasePlugin {
  private readonly CONTEXT_SIZE = 16;
  private readonly INACTIVITY_THRESHOLD_HOURS = 4;
  private lastUserMessageTime: number = Date.now();
  private hasPostedSinceLastUserMessage = false;

  constructor(bot: BaseBot) {
    super(bot);
    this.startInactivityTimer();
  }

  private startInactivityTimer() {
    const check = async () => {
      const delta = (Date.now() - this.lastUserMessageTime) / (1000 * 60 * 60);
      if (delta >= this.INACTIVITY_THRESHOLD_HOURS && !this.hasPostedSinceLastUserMessage) {
        debug(
          chalk.yellow(
            `No user activity detected for ${delta.toFixed(2)} hours, prompting conversation.`
          )
        );

        await this.interact();
        this.hasPostedSinceLastUserMessage = true;
      }
    };

    setInterval(check, 60 * 1000);
  }

  async process(context: PluginContext, next: () => Promise<void>) {
    if (context.message.sender !== this.bot.nick) {
      this.lastUserMessageTime = Date.now();
      this.hasPostedSinceLastUserMessage = false;
    }

    return next();
  }

  async interact() {
    try {
      const context = await Database.getRepository(Message).find({
        where: {
          channel: { name: this.bot.channel },
          sender: { name: Not(this.bot.nick) }
        },
        order: { id: 'DESC' },
        take: this.CONTEXT_SIZE,
        relations: ['sender', 'channel']
      });

      context.reverse();

      debug(chalk.redBright(`Preparing interaction with context:`));
      for (const message of context) {
        debug(chalk.redBright(`  * ${message.sender.name}: ${message.data}`));
      }

      const prompt = [
        '### Your Personality',
        ...this.bot.personality.template,
        '',
        '### IRC Logs',
        ...context.map((message) => `${message.sender.name}: ${message.data}`),
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

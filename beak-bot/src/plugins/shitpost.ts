import chalk from 'chalk';
import { BaseBot } from '../bots/index.js';
import { Database, Message } from '../database/index.js';
import { debug, error } from '../logging/index.js';
import { ModelFactory } from '../models/factory.js';
import { LLMAgent, Personality } from '../models/index.js';
import { Settings } from '../settings.js';
import { OutputMessage } from '../utilities/messages.js';
import { BasePlugin, PluginContext } from './index.js';

export class ShitpostPlugin extends BasePlugin {
  private readonly CONTEXT_SIZE = 16;
  private readonly INACTIVITY_THRESHOLD_HOURS = 4;
  private agent: LLMAgent;
  private timestamp: number = Date.now();

  constructor(bot: BaseBot) {
    super(bot);

    this.agent = new LLMAgent(
      ModelFactory.create(Settings.models[0]!),
      new Personality([
        `Your IRC nickname is ${this.bot.nick}.`,
        `You hang around an IRC channel named ${this.bot.channel}.`,
        'You are designed to shitpost on irc regularly.',
        'User goose is your creator and best friend.',
        'User mxms is mad as fuck.',
        'You hate the radare2 the reverse engineering framework.',
        'Kernel mode is hard.',
        'Fuck nerdcore forever.'
      ])
    );

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
      const { channel } = this.bot;
      const context = await Database.getRepository(Message).find({
        where: { channel: { name: channel } },
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
        '### IRC Logs',
        ...conversation.map((message) => `${message.sender.name}: "${message.data}"`),
        '',
        '### Instructions',
        `Given that there hasn't been any new messages in the last period, craft a shitpost message.`
      ];

      const start = Date.now();
      const response = await this.agent.query(prompt);
      const end = Date.now();
      debug(`Response generated in ${end - start}ms`);

      if (!response.includes('\n')) {
        debug(chalk.greenBright(response));
      } else {
        debug(chalk.redBright(response));
      }

      await this.bot.send('public', channel, OutputMessage.cleanup(response, this.bot.nick));
    } catch (err) {
      error('Error during interaction:', err);
    }
  }
}

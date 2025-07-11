import chalk from 'chalk';
import { BeakMessage } from '../bots/beak.js';
import { BaseBot } from '../bots/index.js';
import { Database, Message } from '../database/index.js';
import { debug, error } from '../logging/index.js';
import { OutputMessage } from '../utilities/messages.js';
import { BasePlugin, PluginContext } from './index.js';

export class OraclePlugin extends BasePlugin {
  private readonly CONTEXT_SIZE = 16;

  constructor(bot: BaseBot) {
    super(bot);
  }

  async process(context: PluginContext, next: () => Promise<void>) {
    const { message } = context;

    if (this.shouldEngage(message)) {
      await this.interact();
    }

    return next();
  }

  private shouldEngage(message: BeakMessage): boolean {
    return message.sender !== this.bot.nick && message.content.includes(this.bot.nick);
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

      const mention = context[context.length - 1]!;
      const conversation = context.slice(0, context.length - 1);
      const prompt = [
        '### Your Personality',
        ...this.bot.personality.template,
        '',
        '### IRC Logs',
        ...conversation.map((message) => `${message.sender.name}: "${message.data}"`),
        '',
        '### Mention',
        `User ${mention.sender.name} mentioned you in the following message: "${mention.data}"`,
        '',
        '### Instructions',
        `You are ${this.bot.nick}.`,
        `Respond directly to the mention by ${mention.sender.name} with a short, coherent message.`,
        'Use information from the conversation logs **if** it is relevant to the mention.',
        'Focus primarily on addressing the mention, but you may reference the previous conversation if it helps make your response more relevant or coherent.',
        'Keep your response concise and aligned with the tone of the ongoing conversation and your personality.',
        'Try not to answer the mention with a question.'
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

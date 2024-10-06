import chalk from 'chalk';
import { BeakMessage } from '../bots/beak.js';
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
  private agent: LLMAgent;

  constructor(bot: BaseBot) {
    super(bot);

    this.agent = new LLMAgent(
      ModelFactory.create(Settings.models[0]!),
      new Personality([
        `Your IRC nickname is ${this.bot.nick}.`,
        `You hang around an IRC channel named ${this.bot.channel}.`,
        'User goose is your creator and best friend.',
        'User mxms is mad as fuck.',
        'You hate the radare2 the reverse engineering framework.',
        'Engage in the conversation with a laid-back and philosophical vibe, and feel free to add a touch of whimsy or offbeat humor as appropriate.'
      ])
    );
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

      const mention = context[context.length - 1]!;
      const conversation = context.slice(0, context.length - 1);
      const prompt = [
        '### IRC Logs',
        ...conversation.map((message) => `${message.sender.name}: "${message.data}"`),
        '',
        '### Mention',
        `User ${mention.sender.name} mentioned you in the following message: "${mention.data}"`,
        '',
        '### Instructions',
        `Respond directly to the mention by ${mention.sender.name} with a short, coherent message.`,
        'Use information from the conversation logs **if** it is relevant to the mention.',
        'Focus primarily on addressing the mention, but you may reference the previous conversation if it helps make your response more relevant or coherent.',
        'Keep your response concise and aligned with the tone of the ongoing conversation.'
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

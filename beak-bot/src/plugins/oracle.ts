import chalk from 'chalk';
import { BeakMessage } from '../bots/beak.js';
import { BaseBot } from '../bots/index.js';
import { debug, error } from '../logging/index.js';
import { Reply } from '../reply/index.js';
import { Transcript } from '../transcript/index.js';
import { stripOpeningLaugh } from '../utilities/messages.js';
import { BasePlugin, PluginContext } from './index.js';

export class OraclePlugin extends BasePlugin {
  private readonly CONTEXT_SIZE = 16;

  constructor(
    bot: BaseBot,
    private transcript: Transcript,
    private reply: Reply
  ) {
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
      const context = await this.transcript.recent(this.bot.channel, this.CONTEXT_SIZE);

      debug(chalk.redBright(`Preparing interaction with context:`));
      for (const line of context) {
        debug(chalk.redBright(`  * ${line.sender}: ${line.text}`));
      }

      // The mention is the line that woke us up, so it is always the last one.
      const mention = context[context.length - 1];
      if (!mention) {
        error('Asked to react to a mention but the transcript came back empty');
        return;
      }

      const conversation = context.slice(0, context.length - 1);
      const prompt = [
        '### Your Personality',
        ...this.bot.personality.template,
        '',
        '### IRC Logs',
        // Our own logged replies stay in the context, because dropping them
        // makes the thread unreadable: half the turns here are reactions to
        // things we said. Only the tic comes out, so the model still knows
        // what it said without being shown 82% "haha" openers to copy.
        ...conversation.map((line) => {
          const text = line.sender === this.bot.nick ? stripOpeningLaugh(line.text) : line.text;
          return `${line.sender}: "${text}"`;
        }),
        '',
        '### Mention',
        `User ${mention.sender} mentioned you in the following message: "${mention.text}"`,
        '',
        '### Instructions',
        `You are ${this.bot.nick}.`,
        `Respond directly to the mention by ${mention.sender} with a short, coherent message.`,
        'Use information from the conversation logs **if** it is relevant to the mention.',
        'Focus primarily on addressing the mention, but you may reference the previous conversation if it helps make your response more relevant or coherent.',
        'Keep your response concise and aligned with the tone of the ongoing conversation and your personality.',
        'Try not to answer the mention with a question.',
        'The logs contain your own previous messages. Do not copy their style,',
        'and in particular never open with laughter such as "haha" or "lol".'
      ];

      await this.reply.publish('public', this.bot.channel, prompt);
    } catch (err) {
      error('Error during interaction:', err);
    }
  }
}

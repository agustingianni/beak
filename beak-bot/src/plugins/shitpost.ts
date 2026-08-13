import chalk from 'chalk';
import { BaseBot } from '../bots/index.js';
import { debug, error } from '../logging/index.js';
import { Reply } from '../reply/index.js';
import { Transcript } from '../transcript/index.js';
import { BasePlugin, PluginContext } from './index.js';

export class ShitpostPlugin extends BasePlugin {
  private readonly CONTEXT_SIZE = 16;
  private readonly INACTIVITY_THRESHOLD_HOURS = 4;
  private lastUserMessageTime: number = Date.now();
  private hasPostedSinceLastUserMessage = false;

  constructor(
    bot: BaseBot,
    private transcript: Transcript,
    private reply: Reply
  ) {
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
      // Our own posts stay out of this prompt: the channel being quiet means
      // the humans stopped talking, and feeding our last shitpost back in just
      // makes us write a variation on it.
      const context = await this.transcript.recent(this.bot.channel, this.CONTEXT_SIZE, {
        excluding: this.bot.nick
      });

      debug(chalk.redBright(`Preparing interaction with context:`));
      for (const line of context) {
        debug(chalk.redBright(`  * ${line.sender}: ${line.text}`));
      }

      const prompt = [
        '### IRC Logs',
        ...context.map((line) => `${line.sender}: ${line.text}`),
        '',
        '### Instructions',
        `You are ${this.bot.nick}.`,
        `The channel has been quiet for a while.`,
        `Craft a short, witty, or interesting message to get the conversation going again.`,
        `Your message should be in character with your personality and could be a random thought, a joke, or a comment related to the last conversation topics.`,
        'Reply with exactly one line of plain text. No line breaks, no quotes ' +
          'around it, no markdown, and no nickname prefix.'
      ];

      await this.reply.publish('public', this.bot.channel, prompt, this.bot.personality.system());
    } catch (err) {
      error('Error during interaction:', err);
    }
  }
}

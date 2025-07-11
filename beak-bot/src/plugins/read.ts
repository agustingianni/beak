import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { BaseBot } from '../bots/index.js';
import { error, info } from '../logging/index.js';
import { BasePlugin, PluginContext } from './index.js';

export class ReadPlugin extends BasePlugin {
  constructor(bot: BaseBot) {
    super(bot);
  }

  async process(context: PluginContext, next: () => Promise<void>) {
    const { message } = context;

    if (message.sender === this.bot.nick) {
      return next();
    }

    const match = message.content.match(/^!read\s+(https?:\/\/\S+)/);
    if (!match) {
      return next();
    }

    const url = match[1]!;

    try {
      info(`Fetching and processing content from URL: ${url}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error: ${res.status}`);

      const html = await res.text();
      const dom = new JSDOM(html, { url });

      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article || !article.title || !article.textContent || article.textContent.length < 50) {
        throw new Error('Failed to extract meaningful content');
      }

      const snippet = article.textContent.slice(0, 1024 * 4);

      const prompt = [
        '### Your Personality',
        ...this.bot.personality.template,
        '',
        '### Document Title',
        article.title,
        '',
        '### Document Content',
        snippet,
        '',
        '### Instructions',
        `You are ${this.bot.nick}.`,
        'Summarize or comment on the above document in a concise and relevant way.',
        'Focus on interesting insights, not just a generic summary.'
      ];

      console.log(prompt);

      const response = await this.bot.agent.query(prompt);
      await this.bot.send('public', this.bot.channel, response);
    } catch (err) {
      error(`!read error for ${url}:`, err);
      await this.bot.send('private', message.sender, `Failed to process URL: ${err}`);
    }

    return next();
  }
}

import chalk from 'chalk';
import { BaseClient, PrivateMessage, PublicMessage } from '../clients/index.js';
import { Channel, Database, Message, findOrCreateUser } from '../database/index.js';
import { debug, error } from '../logging/index.js';
import { LLMAgent, Personality } from '../models/index.js';
import { BaseBot, BotSettings } from './index.js';

export interface BeakMessage {
  id: number;
  sender: string;
  channel: string;
  content: string;
}

export class BeakBot extends BaseBot {
  constructor(
    private client: BaseClient,
    settings: BotSettings,
    agent: LLMAgent,
    personality: Personality
  ) {
    super(settings, agent, personality);
  }

  async start() {
    this.client.on('public-message', (event) => this.publicMessageHandler(event));
    this.client.on('private-message', (event) => this.privateMessageHandler(event));
    await this.client.start();
  }

  async stop() {
    await this.client.stop();
  }

  async publicMessageHandler(event: PublicMessage) {
    // Create the sender rather than bailing out. This used to return early,
    // which silently threw the message away: anyone who spoke before their row
    // existed, which happens while NAMES is still being processed after a
    // join, was simply not recorded.
    const sender = await findOrCreateUser(event.sender);

    const channel = await Database.getRepository(Channel).findOneBy({ name: event.channel });
    if (!channel) {
      error(
        `Dropping message from ${event.sender}: channel ${event.channel} is not in the database yet`
      );
      return;
    }

    const message = await Database.getRepository(Message).save({
      data: event.content,
      sender,
      channel
    });

    await this.addMessage({
      id: message.id,
      sender: event.sender,
      channel: event.channel,
      content: event.content
    });
  }

  async privateMessageHandler(event: PrivateMessage) {
    const sender = await findOrCreateUser(event.sender);
    const recipient = await findOrCreateUser(event.recipient);

    await Database.getRepository(Message).save({
      data: event.content,
      sender,
      recipient
    });
  }

  async send(type: 'public' | 'private', recipient: string, content: string) {
    if (type === 'public') {
      this.publicMessageHandler({ sender: this.nick, channel: recipient, content });
    } else {
      this.privateMessageHandler({ sender: this.nick, recipient, content });
    }

    debug(chalk.yellowBright(`Sending ${type} message to ${recipient}: ${content}`));
    this.client.send(type, recipient, content);
  }
}

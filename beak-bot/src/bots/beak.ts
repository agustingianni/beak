import chalk from 'chalk';
import { BaseClient, PrivateMessage, PublicMessage } from '../clients/index.js';
import { Channel, Database, Message, User } from '../database/index.js';
import { debug, error } from '../logging/index.js';
import { LLMAgent } from '../models/index.js';
import { BaseBot, BotSettings } from './index.js';

export interface BeakMessage {
  id: number;
  sender: string;
  channel: string;
  content: string;
}

export class BeakBot extends BaseBot {
  constructor(
    settings: BotSettings,
    private client: BaseClient,
    agent: LLMAgent
  ) {
    super(settings, agent);
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
    const sender = await Database.getRepository(User).findOneBy({ name: event.sender });
    if (!sender) {
      error(`Error handling message: user ${event.sender} not found`);
      return;
    }

    const channel = await Database.getRepository(Channel).findOneBy({ name: event.channel });
    if (!channel) {
      error(`Error handling message: channel ${event.channel} not found`);
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
    const sender = await Database.getRepository(User).findOneBy({ name: event.sender });
    if (!sender) {
      error(`Error handling message: user ${event.sender} not found`);
      return;
    }

    const recipient = await Database.getRepository(User).findOneBy({ name: event.recipient });
    if (!recipient) {
      error(`Error handling message: user ${event.recipient} not found`);
      return;
    }

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

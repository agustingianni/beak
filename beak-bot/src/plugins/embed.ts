import { BeakBot, BeakMessage } from '../bots/beak.js';
import { Database, Message } from '../database/index.js';
import { debug, info } from '../logging/index.js';
import { VectorDataSource } from '../models/query.js';
import { segment } from '../utilities/text.js';
import { BasePlugin, PluginContext } from './index.js';

export class EmbedPlugin extends BasePlugin {
  private readonly messageThreshold = 12 * 6;
  private readonly segmentSize = 12;
  private readonly overlapSize = 3;
  private messages: BeakMessage[] = [];

  async process({ message }: PluginContext, next: () => Promise<void>) {
    const { channel } = message;

    this.messages.push(message);

    // Embed the messages if we have enough messages.
    if (this.messages.length >= this.messageThreshold) {
      debug(`Threshold exceeded, embedding ${this.messages.length} messages in ${channel}`);

      // Connect to the vector store.
      const store = new VectorDataSource();
      const repository = await store.getRepository(channel);
      debug(`Retreived collection with ${await repository.count()} embedded documents`);

      // Segment the messages into embeddable conversations.
      const conversations = segment(this.messages, this.segmentSize, this.overlapSize);
      debug(
        `Segmented ${this.messages.length} messages into ${conversations.length} conversations`
      );

      // Embed each conversation and insert it into the database.
      for (const conversation of conversations) {
        const id = conversation[0]!.id;
        const content = conversation
          .map((message) => `${message.sender}: ${message.content}`)
          .join('\n');

        await repository.insert({
          id,
          content
        });
      }

      this.messages = [];
    }

    return next();
  }
}

async function main() {
  const channelName = process.argv[2];
  if (!channelName) {
    console.error('Please provide a channel name as an argument');
    process.exit(1);
  }

  await Database.initialize();

  const bot = {} as BeakBot;
  const plugin = new EmbedPlugin(bot);
  const messages = await Database.getRepository(Message).find({
    where: { channel: { name: channelName } },
    relations: ['sender', 'channel']
  });

  info(`Found ${messages.length} messages in ${channelName}`);

  for (const message of messages.slice(0, 12 * 6)) {
    await plugin.process(
      {
        message: {
          id: 1,
          channel: message.channel.name,
          sender: message.sender.name,
          content: message.data
        }
      },
      async () => {}
    );
  }
}

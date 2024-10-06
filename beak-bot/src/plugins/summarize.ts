import { BeakBot } from '../bots/beak.js';
import { Channel, Database, Message, Summary } from '../database/index.js';
import { debug, info } from '../logging/index.js';
import { ModelFactory } from '../models/factory.js';
import { LLMAgent, Personality } from '../models/index.js';
import { Settings } from '../settings.js';
import { BasePlugin, PluginContext } from './index.js';

export class SummarizePlugin extends BasePlugin {
  private readonly MESSAGE_THRESHOLD = 40;
  private readonly agent: LLMAgent;

  constructor(bot: BeakBot) {
    super(bot);

    this.agent = new LLMAgent(
      ModelFactory.create(Settings.models[0]!),
      new Personality([
        'Your name is beak',
        'You are an expert at summarizing informal chat conversations on platforms like IRC, Discord, or Slack.',
        'Your goal is to succinctly summarize the conversation into a coherent and concise narrative that captures the essence of the discussion.',
        'Ensure that the summary includes the main ideas and flow of the conversation, making it easy to understand the context for follow-up queries.',
        'Example of a good summary: "The group discussed the upcoming release schedule and potential challenges with new features. They agreed to conduct a test deployment next Monday. There were also suggestions to improve the onboarding process for new developers and to update the project documentation. A follow-up meeting was scheduled for Wednesday to review progress."'
      ])
    );
  }

  async process({ message }: PluginContext, next: () => Promise<void>) {
    const { channel: channelName } = message;
    debug(`Processing messages for channel ${channelName}`);

    // Get all the messages for a given channel that do not have a summary.
    const messages = await Database.getRepository(Message)
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.channel', 'channel')
      .leftJoinAndSelect('message.summary', 'summary')
      .leftJoinAndSelect('message.sender', 'sender')
      .where('channel.name = :channelName', { channelName })
      .andWhere('summary.id IS NULL')
      .orderBy('message.created', 'ASC')
      .take(this.MESSAGE_THRESHOLD)
      .getMany();

    // Summarize the messages if we have enough messages.
    if (messages.length >= this.MESSAGE_THRESHOLD) {
      info(`Threshold exceeded, summarizing ${messages.length} messages in ${channelName}`);

      // Summarize the messages.
      const context = messages.map((msg) => `${msg.sender.name}: ${msg.data}`).join('\n');
      const result = await this.agent.query(['Summarize the following conversation:', context]);

      // Save the summary in the database.
      const channel = await Database.getRepository(Channel).findOneBy({ name: channelName });
      if (channel) {
        await Database.getRepository(Summary).save({
          data: result.trim(),
          channel,
          messages
        });
      }
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
  const plugin = new SummarizePlugin(bot);
  const messages = await Database.getRepository(Message).find({
    where: { channel: { name: channelName } },
    relations: ['sender', 'channel']
  });

  info(`Found ${messages.length} messages in ${channelName}`);

  let i = 0;
  for (const message of messages) {
    await plugin.process(
      {
        message: {
          id: i++,
          channel: message.channel.name,
          sender: message.sender.name,
          content: message.data
        }
      },
      async () => {}
    );
  }
}

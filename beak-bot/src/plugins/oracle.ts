import { MoreThanOrEqual } from 'typeorm';
import { BeakBot } from '../bots/beak.js';
import { Database, Message } from '../database/index.js';
import { ModelFactory } from '../models/factory.js';
import { LLMAgent, Personality } from '../models/index.js';
import { VectorDataSource } from '../models/query.js';
import { Settings } from '../settings.js';
import { OutputMessage } from '../utilities/messages.js';
import { BasePlugin, PluginContext } from './index.js';

export class OraclePlugin extends BasePlugin {
  private agent: LLMAgent;
  private store: VectorDataSource;
  private readonly CONTEXT_SIZE = 12;
  private readonly QUERY_K = 4;

  constructor(bot: BeakBot) {
    super(bot);

    this.agent = new LLMAgent(
      ModelFactory.create(Settings.models[0]!),
      new Personality([
        `Your irc nick name is ${this.bot.nick}.`,
        'Your responses should be quick, clever, and occasionally blunt.',
        'Engage in the conversation naturally, and feel free to add a touch of humor or toughness as appropriate.'
      ])
    );

    this.store = new VectorDataSource();
  }

  async answer(sender: string, question: string, facts: string[]): Promise<string> {
    const response = await this.agent.query([
      `You are in a conversation where ${sender} has asked a question.`,
      `Here are some additional facts that might help answer the question:`,
      ...facts,
      `If you don't know the answer, respond with "I don't know."`,
      `If the question is relevant and you know the answer, provide a concise and accurate response.`,
      `Question from ${sender}:\n${question}`
    ]);

    return OutputMessage.cleanup(response, this.bot.nick);
  }

  async process({ message }: PluginContext, next: () => Promise<void>) {
    const { sender, channel, content: question } = message;

    // Make sure the sender is not the bot.
    if (sender !== this.bot.nick && question.includes(this.bot.nick)) {
      // Retrieve any possible context from the database.
      const facts: string[] = [];
      const repository = await this.store.getRepository(channel);
      const results = await repository.query({ question }, this.QUERY_K);
      for (const { id } of results) {
        const messages = await Database.getRepository(Message).find({
          where: { id: MoreThanOrEqual(parseInt(id)), channel: { name: channel } },
          order: { id: 'ASC' },
          take: this.CONTEXT_SIZE,
          relations: ['sender']
        });

        facts.push(...messages.map((message) => `${message.sender.name}: ${message.data}`));
      }

      // Answer the question.
      const answer = await this.answer(sender, question, facts);
      await this.bot.send('public', channel, answer);
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

  const query = process.argv.slice(3).join(' ');
  if (!query) {
    console.error('Please provide a query as an argument');
    process.exit(1);
  }

  await Database.initialize();

  const bot = {} as BeakBot;
  const plugin = new OraclePlugin(bot);
  const result = await plugin.process(
    {
      message: {
        id: 1,
        channel: '#0x4f',
        sender: 'goose',
        content: query
      }
    },
    async () => {}
  );

  console.log(result);
}

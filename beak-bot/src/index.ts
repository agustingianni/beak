#!/usr/bin/env node
import PrettyError from 'pretty-error';
import { BeakBot } from './bots/beak.js';
import { BotSettings } from './bots/index.js';
import { IRCClient } from './clients/irc.js';
import { Database } from './database/index.js';
import { error, info } from './logging/index.js';
import { ModelFactory } from './models/factory.js';
import { LLMAgent, Personality } from './models/index.js';
import { OraclePlugin } from './plugins/oracle.js';
import { PersonalityPlugin } from './plugins/personality.js';
import { ShitpostPlugin } from './plugins/shitpost.js';
import { Settings } from './settings.js';
import { ReadPlugin } from './plugins/read.js';

async function main() {
  info(`Beak Settings:`);
  info(Settings);

  try {
    // Initialize the database
    info('Connecting to the database...');
    await Database.initialize();
    info('Database connected.');
  } catch (err) {
    error('Failed to connect to the database:', err);
    process.exit(1);
  }

  const client = new IRCClient(Settings);

  const settings: BotSettings = {
    nick: Settings.user.nick,
    channel: Settings.user.channel
  };

  const personality = new Personality([
    `Your IRC nickname is ${Settings.user.nick}.`,
    `You hang around an IRC channel named ${Settings.user.channel}.`,
    'User goose is your creator and best friend.'
  ]);

  const agent = new LLMAgent(ModelFactory.create(Settings.models[0]!));

  const bot = new BeakBot(client, settings, agent, personality);
  bot.addPlugin(new PersonalityPlugin(bot));
  bot.addPlugin(new OraclePlugin(bot));
  bot.addPlugin(new ShitpostPlugin(bot));
  bot.addPlugin(new ReadPlugin(bot));

  await bot.start();

  // Signal handling for graceful shutdown
  const shutdown = async (reason: string, code = 0) => {
    try {
      info(`Shutdown initiated due to: ${reason}. Proceeding with graceful termination...`);

      if (bot) {
        await bot.stop();
        info('Bot stopped.');
      }

      if (Database) {
        await Database.destroy();
        info('Database disconnected.');
      }

      process.exit(code);
    } catch (shutdownError) {
      error('Error during shutdown process:', shutdownError);
      process.exit(1);
    }
  };

  // Listen for shutdown signals
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', async (reason: Error) => {
    error('Unhandled rejection');
    error(`${new PrettyError().render(reason)}`);
    await shutdown('unhandledRejection', 1);
  });

  process.on('uncaughtException', async (reason: Error) => {
    error('Unhandled exception');
    error(`${new PrettyError().render(reason)}`);
    await shutdown('uncaughtException', 1);
  });
}

try {
  await main();
} catch (e) {
  error(e);
  process.exit(1);
}

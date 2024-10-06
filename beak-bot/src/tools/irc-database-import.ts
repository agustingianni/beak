import ora from 'ora';
import { Channel, Database, Message, User } from '../database/index.js';
import { processLogFile } from './irc-process.js';

async function main() {
  const fileName = process.argv[2];
  if (!fileName) {
    console.error('Please provide a log file as an argument');
    process.exit(1);
  }

  const channelName = process.argv[3];
  if (!channelName) {
    console.error('Please provide a channel as an argument');
    process.exit(1);
  }

  await Database.initialize();
  const channel = await Database.getRepository(Channel).findOneBy({ name: channelName });
  if (!channel) {
    console.log('Channel not found:', channelName);
    process.exit(1);
  }

  const records = await processLogFile(fileName);
  const importSpinner = ora('Importing chat logs into database').start();
  for (const record of records) {
    let sender = await Database.getRepository(User).findOneBy({ name: record.user });
    if (!sender) {
      sender = await Database.getRepository(User).save({
        name: record.user
      });
    }

    if (
      await Database.getRepository(Message).existsBy({
        data: record.content,
        sender,
        channel
      })
    ) {
      continue;
    }

    await Database.getRepository(Message).save({
      data: record.content,
      sender,
      channel
    });
  }

  importSpinner.succeed('Imported chat logs into database');
}

main().catch(console.error);

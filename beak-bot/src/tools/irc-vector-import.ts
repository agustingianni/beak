import ora from 'ora';
import readline from 'readline';
import { Channel, Database, Message } from '../database/index.js';
import { VectorDataSource } from '../models/query.js';
import { segment } from '../utilities/text.js';
import { debug } from '../logging/index.js';

const promptUser = (query: string): Promise<string> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) =>
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    })
  );
};

async function main() {
  const channelName = process.argv[2];
  if (!channelName) {
    console.error('Please provide a channel as an argument');
    process.exit(1);
  }

  let limit: number | undefined;
  if (process.argv[3]) {
    limit = parseInt(process.argv[3]);
  }

  try {
    await Database.initialize();
    const channel = await Database.getRepository(Channel).findOneBy({ name: channelName });
    if (!channel) {
      console.log('Channel not found:', channelName);
      process.exit(1);
    }

    const store = new VectorDataSource();
    let repository = await store.getRepository(channel.name);

    if (!(await repository.empty())) {
      const response = await promptUser('Do you want to delete the collection? (y/n): ');
      if (response.toLowerCase() !== 'y') {
        console.log('Aborted import of chat logs for channel:', channelName);
        process.exit(0);
      }

      const deleteSpinner = ora('Deleting collection...').start();
      await store.deleteRepository(channel.name);
      deleteSpinner.succeed('Collection deleted.');

      repository = await store.getRepository(channel.name);
    }

    const messages = await Database.getRepository(Message).find({
      where: { channel: { name: channelName } },
      relations: ['sender', 'channel'],
      ...(limit ? { take: limit } : {})
    });

    console.log(`Loaded ${messages.length} messages from ${channel.name}`);

    const conversations = segment(messages, 12, 3);
    debug(`Segmented ${messages.length} messages into ${conversations.length} conversations`);

    const importSpinner = ora('Importing conversations into the vector store').start();
    for (const [index, conversation] of conversations.entries()) {
      importSpinner.text = `Processing conversation ${index + 1}/${conversations.length}`;

      const id = conversation[0]!.id;
      const content = conversation
        .map((message) => `${message.sender.name}: ${message.data}`)
        .join('\n');

      await repository.insert({
        id,
        content
      });
    }

    importSpinner.succeed('Imported conversations into the vector store');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);

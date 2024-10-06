import { MoreThanOrEqual } from 'typeorm';
import { Channel, Database, Message } from '../database/index.js';
import { VectorDataSource } from '../models/query.js';

const channelName = process.argv[2];
if (!channelName) {
  console.error('Please provide a channel as an argument');
  process.exit(1);
}

const query = process.argv.slice(3).join(' ');
if (!query) {
  console.error('Please provide a query as an argument');
  process.exit(1);
}

await Database.initialize();
const channel = await Database.getRepository(Channel).findOneBy({ name: channelName });
if (!channel) {
  console.log('Channel not found:', channelName);
  process.exit(1);
}

console.log(`Querying ${channelName} with query: '${query}'`);

const store = new VectorDataSource();
const repository = await store.getRepository(channel.name);
console.log('Entries:', await repository.count());

const results = await repository.query({ query }, 8);
console.log('Results:', results.length);
for (const { id, distance } of results) {
  const messages = await Database.getRepository(Message).find({
    where: { id: MoreThanOrEqual(parseInt(id)), channel: { name: channelName } },
    take: 12,
    relations: ['sender']
  });

  console.log('ID:', id, 'Distance:', distance);
  console.table(
    messages.map((message) => ({ id: message.id, user: message.sender.name, data: message.data }))
  );
}

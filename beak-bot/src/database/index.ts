import { bool, envsafe, url } from 'envsafe';
import {
  Column,
  CreateDateColumn,
  DataSource,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn
} from 'typeorm';

const { DATABASE_URI, DATABASE_SYNCHRONIZE, DATABASE_LOGGING, DATABASE_DROP_SCHEMA } = envsafe({
  DATABASE_URI: url({
    devDefault: 'postgresql://beak:beak@localhost:5555/beak',
    desc: 'The PostgreSQL connection string for connecting to the database.'
  }),
  DATABASE_SYNCHRONIZE: bool({
    devDefault: true,
    default: false,
    desc: 'Enables automatic database schema synchronization.'
  }),
  DATABASE_LOGGING: bool({
    default: false,
    desc: 'Enables or disables debug mode, which provides more detailed logging.'
  }),
  DATABASE_DROP_SCHEMA: bool({
    default: false,
    desc: 'Enables or disables the automatic dropping of the database schema.'
  })
});

@Entity()
export class Server {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  name!: string;

  @Column()
  hostname!: string;

  @Column({ default: 6667 })
  port!: number;

  @Column({ default: false })
  tls!: boolean;

  @Column({ default: '' })
  password!: string;

  @Column({ default: '' })
  motd!: string;

  @OneToMany(() => Channel, (channel) => channel.server)
  channels!: Channel[];

  @OneToMany(() => Notice, (notice) => notice.fromServer)
  sentNotices!: Notice[];

  @OneToMany(() => ServerEvent, (event) => event.server)
  events!: ServerEvent[];
}

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  name!: string;

  @ManyToMany(() => Channel, (channel) => channel.users)
  @JoinTable()
  channels!: Channel[];

  @OneToMany(() => Message, (message) => message.sender)
  sent_messages!: Message[];

  @OneToMany(() => Message, (message) => message.recipient)
  received_messages!: Message[];

  @OneToMany(() => UserEvent, (status) => status.user)
  events!: UserEvent[];

  @OneToMany(() => Notice, (notice) => notice.toUser)
  receivedNotices!: Notice[];

  @OneToMany(() => Notice, (notice) => notice.fromUser)
  sentNotices!: Notice[];

  @OneToMany(() => Topic, (topic) => topic.user)
  topics!: Topic[];
}

@Entity()
export class Channel {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ default: '' })
  mode!: string;

  @OneToMany(() => Topic, (topic) => topic.channel)
  topics!: Topic[];

  @ManyToOne(() => Server, (server) => server.channels, { nullable: false })
  server!: Server;

  @ManyToMany(() => User, (user) => user.channels)
  users!: User[];

  @OneToMany(() => Message, (message) => message.channel)
  messages!: Message[];

  @OneToMany(() => ChannelEvent, (event) => event.channel)
  events!: ChannelEvent[];

  @OneToMany(() => Notice, (notice) => notice.toChannel)
  receivedNotices!: Notice[];

  @OneToMany(() => Summary, (summary) => summary.channel)
  summaries!: Summary[];
}

@Entity()
export class Summary {
  @PrimaryGeneratedColumn()
  id!: number;

  @CreateDateColumn()
  created!: Date;

  @Column()
  data!: string;

  @ManyToOne(() => Channel, (channel) => channel.summaries, { nullable: true })
  channel!: Channel;

  @OneToMany(() => Message, (message) => message.summary)
  messages!: Message[];
}

@Entity()
export class Topic {
  @PrimaryGeneratedColumn()
  id!: number;

  @CreateDateColumn()
  created!: Date;

  @Column()
  topic!: string;

  @ManyToOne(() => User, (user) => user.topics, { nullable: false })
  user!: User;

  @ManyToOne(() => Channel, (channel) => channel.topics, { nullable: false })
  channel!: Channel;
}

@Entity()
export class Notice {
  @PrimaryGeneratedColumn()
  id!: number;

  @CreateDateColumn()
  created!: Date;

  @Column()
  content!: string;

  @ManyToOne(() => User, (user) => user.sentNotices, { nullable: true })
  fromUser?: User;

  @ManyToOne(() => Server, (server) => server.sentNotices, { nullable: true })
  fromServer?: Server;

  @ManyToOne(() => User, (user) => user.receivedNotices, { nullable: true })
  toUser?: User;

  @ManyToOne(() => Channel, (channel) => channel.receivedNotices, { nullable: true })
  toChannel?: Channel;
}

@Entity()
export class Message {
  @PrimaryGeneratedColumn()
  id!: number;

  @CreateDateColumn()
  created!: Date;

  @Column()
  data!: string;

  @ManyToOne(() => User, (user) => user.sent_messages, { nullable: false })
  sender!: User;

  @ManyToOne(() => User, (user) => user.received_messages, { nullable: true })
  recipient!: User;

  @ManyToOne(() => Channel, (channel) => channel.messages, { nullable: true })
  channel!: Channel;

  @ManyToOne(() => Summary, (summary) => summary.messages, { nullable: true })
  summary!: Summary;

  @Column({ default: false })
  action!: boolean;
}

@Entity()
export class UserEvent {
  @PrimaryGeneratedColumn()
  id!: number;

  @CreateDateColumn()
  created!: Date;

  @Column('simple-json')
  event!: any;

  @ManyToOne(() => User, (user) => user.events, { nullable: false })
  user!: User;
}

@Entity()
export class ChannelEvent {
  @PrimaryGeneratedColumn()
  id!: number;

  @CreateDateColumn()
  created!: Date;

  @Column('simple-json')
  event!: any;

  @ManyToOne(() => Channel, (channel) => channel.events, { nullable: false })
  channel!: Channel;
}

@Entity()
export class ServerEvent {
  @PrimaryGeneratedColumn()
  id!: number;

  @CreateDateColumn()
  created!: Date;

  @Column('simple-json')
  event!: any;

  @ManyToOne(() => Server, (server) => server.events, { nullable: false })
  server!: Server;
}

export const Database = new DataSource({
  type: 'postgres',
  url: DATABASE_URI,
  synchronize: DATABASE_SYNCHRONIZE,
  logging: DATABASE_LOGGING,
  dropSchema: DATABASE_DROP_SCHEMA,
  entities: [
    Server,
    User,
    Channel,
    Message,
    Summary,
    UserEvent,
    ChannelEvent,
    ServerEvent,
    Notice,
    Topic
  ]
});

export async function findOrCreateServer(
  name: string,
  hostname: string,
  port: number,
  tls: boolean,
  password: string
) {
  // Create the server if it does not exist.
  let server = await Database.getRepository(Server).findOne({
    where: {
      name,
      hostname,
      port,
      tls,
      password
    },
    relations: ['channels']
  });

  if (!server) {
    server = await Database.getRepository(Server).save({
      name,
      hostname,
      port,
      tls,
      password
    });
  }

  return server;
}

// Postgres: unique_violation.
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  const candidate = err as { code?: string; driverError?: { code?: string } };
  return candidate?.code === UNIQUE_VIOLATION || candidate?.driverError?.code === UNIQUE_VIOLATION;
}

export async function findOrCreateUser(userName: string) {
  const repository = Database.getRepository(User);

  const existing = await repository.findOne({ where: { name: userName } });
  if (existing) {
    return existing;
  }

  // There is an await above, so two handlers reacting to the same new nick can
  // both get here. That is how four rows named "goose" appeared. With the
  // unique index on user.name Postgres now rejects the loser, so take that as
  // "someone else just created it" and use theirs.
  try {
    return await repository.save({ name: userName, channels: [] });
  } catch (err) {
    if (!isUniqueViolation(err)) {
      throw err;
    }

    const raced = await repository.findOne({ where: { name: userName } });
    if (!raced) {
      throw err;
    }

    return raced;
  }
}

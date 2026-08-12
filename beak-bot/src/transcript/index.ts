// A channel transcript, in the order a human would read it: oldest line first.
//
// Four plugins used to hand roll the same TypeORM query, each one responsible
// for remembering to ask for the sender and channel relations and to reverse
// the DESC result. Getting either wrong is silent: you still get lines, they
// are just the wrong ones or in the wrong order. That belongs in one place.
export type Line = {
  sender: string;
  text: string;
};

export type RecentOptions = {
  // Skip lines written by this nickname. Used when we want to react to what
  // the humans have been saying without feeding our own output back in.
  excluding?: string;
};

// A line addressed to the bot rather than to the channel: "!personality set
// ...", "!read <url>". Every transcript reader builds a model prompt out of
// what it gets back, and these lines are actively harmful there.
//
// "!personality set you are a grumpy pirate" would otherwise land in the logs
// next to the personality block that already carries it, so the same order
// arrives twice, and the copy in the logs outlives the command: a personality
// that was replaced an hour ago still sits in the window contradicting the
// current one. Text that never took effect gets in the same way, because a
// misspelled "!personallity set ..." is dropped by the plugin and kept by the
// database.
//
// A bare "!" or a line of "!!!" is somebody shouting, not a command, so the
// word character after the "!" is required.
export function isCommand(text: string): boolean {
  return /^!\w/.test(text);
}

export interface Transcript {
  // Returns at most `limit` lines, oldest first. A channel with no messages
  // yields an empty array rather than throwing. Command lines never come back,
  // see isCommand: they are kept in the database, which is the record of the
  // channel, and left out of the window the model reads.
  recent(channel: string, limit: number, options?: RecentOptions): Promise<Line[]>;
}

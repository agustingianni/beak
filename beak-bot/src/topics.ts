import nlp from 'compromise';
import validator from 'validator';

interface LogEntry {
  timestamp: string;
  user: string;
  message: string;
}

function parseLogLine(line: string): LogEntry | null {
  const userMessageRegex = /^\[(\d{2}:\d{2})\] <(.+?)> (.*)$/;

  const match = line.match(userMessageRegex);
  if (match) {
    return { timestamp: match[1]!, user: match[2]!, message: match[3]! };
  }

  return null;
}

function removePunctuation(word: string): string {
  return word.replace(/[.,/#!$%^&*;:{}=\-_`~()"]/g, '');
}

export async function fetchUbuntuLogs() {
  const rawLines: string[] = [];
  for (let i = 1; i <= 12; i++) {
    for (let j = 1; j <= 31; j++) {
      const month = i.toString().padStart(2, '0');
      const day = j.toString().padStart(2, '0');

      const url = `https://irclogs.ubuntu.com/2023/${month}/${day}/%23ubuntu.txt`;
      const data = await fetch(url);
      if (!data.ok) {
        continue;
      }

      rawLines.push(...(await data.text()).split('\n'));
    }

    break;
  }

  const parsedLogs = rawLines.map(parseLogLine).filter((entry) => entry !== null) as LogEntry[];

  return parsedLogs;
}

function cleanMultipleSpaces(message: string): string {
  return message.replace(/\s+/g, ' ');
}

function cleanHashTag(tag: string): string {
  const match = tag.match(/^#[\w-]+/);
  if (!match) return tag;
  const cleanedTag = match[0].replace(/[.?]+$/, '');
  return cleanedTag;
}

function cleanMention(mention: string) {
  return mention.trim().replace(/[.?]+$/, '');
}

function isValidName(name: string): boolean {
  const regex = /^[a-zA-Z]+(\s[a-zA-Z]+)*$/;
  return name.length >= 3 && regex.test(name);
}

function removeBOM(input: string): string {
  const bomRegex = /\uFEFF/g;
  return input.replace(bomRegex, '');
}

export async function classify(messages: string) {
  const normalized = nlp(cleanMultipleSpaces(removeBOM(messages)))
    .normalize()
    .text();

  const doc = nlp(normalized);

  const people: string[] = doc
    .people()
    .normalize()
    .unique()
    .toLowerCase()
    .out('array')
    .filter(isValidName);

  const places: string[] = doc
    .places()
    .normalize()
    .unique()
    .toLowerCase()
    .out('array')
    .map(removePunctuation)
    .filter((place: string) => place.length >= 3);

  const organizations: string[] = doc
    .organizations()
    .normalize()
    .unique()
    .toLowerCase()
    .out('array')
    .map(cleanMultipleSpaces)
    .map(removePunctuation);

  const mentions: string[] = doc
    .atMentions()
    .normalize()
    .unique()
    .toLowerCase()
    .out('array')
    .map(cleanMention);

  const hashTags: string[] = doc
    .hashTags()
    .normalize()
    .unique()
    .toLowerCase()
    .out('array')
    .map(cleanHashTag);

  const urls: string[] = doc
    .urls()
    .normalize()
    .unique()
    .toLowerCase()
    .out('array')
    .filter((url: string) => validator.isURL(url, { require_protocol: true }));

  const result = [];
  result.push(...people.map((value) => ({ type: 'person', value })));
  result.push(...places.map((value) => ({ type: 'place', value })));
  result.push(...organizations.map((value) => ({ type: 'organization', value })));
  result.push(...mentions.map((value) => ({ type: 'mention', value })));
  result.push(...hashTags.map((value) => ({ type: 'hashtag', value })));
  result.push(...urls.map((value) => ({ type: 'url', value })));

  return result;
}

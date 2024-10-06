import { readFile } from 'fs/promises';
import ora from 'ora';

interface Entry {
  timestamp: string;
  user: string;
  content: string;
}

export const processLogFile = async (filename: string): Promise<Entry[]> => {
  const spinner = ora('Reading log file').start();
  try {
    const contents = await readFile(filename, 'utf8');
    const records = contents
      .split('\n')
      .map((line) => line.match(/^\[(.*?)\] <(.*?)> (.*)$/))
      .filter(Boolean)
      .map((match) => ({
        timestamp: match![1]!,
        user: match![2]!,
        content: match![3]!
      }));

    spinner.succeed(`Log file processed with ${records.length} entries found.`);
    return records;
  } catch (error) {
    spinner.fail('Failed to read log file');
    throw error;
  }
};

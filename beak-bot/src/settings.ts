import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';
import { z } from 'zod';

const SettingsSchema = z.object({
  user: z.object({
    nick: z.string(),
    name: z.string(),
    channel: z.string()
  }),
  server: z.object({
    host: z.string(),
    port: z.number().positive(),
    secure: z.boolean(),
    password: z.string().optional()
  }),
  // One line per trait. The nickname and channel lines are added automatically
  // from the user block above, so they do not belong here. Omit the key
  // entirely and index.ts falls back to a built in default.
  personality: z.array(z.string()).optional(),
  models: z.array(z.string())
});

export type BotSettings = z.infer<typeof SettingsSchema>;

// Replace ${VAR} with the environment variable of that name, so secrets like
// API keys stay in .env instead of being committed inside settings.yaml.
function expandEnvironment(contents: string): string {
  return contents.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => {
    const value = process.env[name];
    if (value === undefined) {
      throw new Error(`settings.yaml references ${name}, but it is not set in the environment`);
    }
    return value;
  });
}

const yamlPath = path.resolve('settings.yaml');
const fileContents = parse(expandEnvironment(fs.readFileSync(yamlPath, 'utf8')));
export const Settings = SettingsSchema.parse(fileContents);

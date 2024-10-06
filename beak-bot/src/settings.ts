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
  models: z.array(z.string())
});

export type BotSettings = z.infer<typeof SettingsSchema>;

const yamlPath = path.resolve('settings.yaml');
const fileContents = parse(fs.readFileSync(yamlPath, 'utf8'));
export const Settings = SettingsSchema.parse(fileContents);

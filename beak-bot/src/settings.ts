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

// Model URI schemes whose first segment is a host rather than an API key.
// Everything else is assumed to carry a secret there, so a scheme added later
// is redacted by default instead of leaking until someone remembers this file.
const SECRETLESS_SCHEMES = new Set(['ollama']);

function redactModelUri(uri: string): string {
  const [scheme, parameters] = uri.split('://');
  if (!scheme || !parameters) {
    // Not a shape we recognise, so we cannot say which part is the secret.
    return '***';
  }

  if (SECRETLESS_SCHEMES.has(scheme)) {
    return uri;
  }

  // Same rule as ModelFactory: only the first slash separates the key from the
  // model name, because model names contain slashes ("openai/gpt-oss-120b").
  const index = parameters.indexOf('/');
  const model = index === -1 ? '' : parameters.slice(index + 1);
  return `${scheme}://***/${model}`;
}

// Settings holds live credentials, and index.ts logs it on every startup. That
// put both API keys into "docker compose logs" in plain text. Log this instead:
// the shape stays readable, the secrets do not survive the copy.
export function redactSecrets(settings: BotSettings): BotSettings {
  return {
    ...settings,
    server: {
      ...settings.server,
      ...(settings.server.password === undefined ? {} : { password: '***' })
    },
    models: settings.models.map(redactModelUri)
  };
}

const yamlPath = path.resolve('settings.yaml');
const fileContents = parse(expandEnvironment(fs.readFileSync(yamlPath, 'utf8')));
export const Settings = SettingsSchema.parse(fileContents);

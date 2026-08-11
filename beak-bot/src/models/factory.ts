import { GroqModel } from './groq.js';
import { LLMModel } from './index.js';
import { OllamaModel } from './ollama.js';

export class ModelFactory {
  // Model names can themselves contain slashes ("openai/gpt-oss-120b"), so only
  // the first slash separates the endpoint from the model name.
  private static split(parameters: string): [string, string] {
    const index = parameters.indexOf('/');
    if (index === -1) {
      return [parameters, ''];
    }

    return [parameters.slice(0, index), parameters.slice(index + 1)];
  }

  static create(uri: string): LLMModel {
    const [protocol, parameters] = uri.split('://');
    if (!protocol || !parameters) {
      throw new Error('Invalid model URI');
    }

    switch (protocol) {
      case 'ollama': {
        const [baseUrl, modelName] = ModelFactory.split(parameters);
        if (!baseUrl || !modelName) {
          throw new Error('Invalid ollama URI: missing base URL or model name');
        }

        return new OllamaModel(`http://${baseUrl}`, modelName);
      }

      case 'groq': {
        const [apiKey, modelName] = ModelFactory.split(parameters);
        if (!apiKey || !modelName) {
          throw new Error('Invalid groq URI: missing API key or model name');
        }
        return new GroqModel(apiKey, modelName);
      }

      default:
        throw new Error('Unsupported model type');
    }
  }
}

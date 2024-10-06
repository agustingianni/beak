import { GroqModel } from './groq.js';
import { LLMModel } from './index.js';
import { OllamaModel } from './ollama.js';

export class ModelFactory {
  static create(uri: string): LLMModel {
    const [protocol, parameters] = uri.split('://');
    if (!protocol || !parameters) {
      throw new Error('Invalid model URI');
    }

    switch (protocol) {
      case 'ollama': {
        const [baseUrl, modelName] = parameters.split('/');
        if (!baseUrl || !modelName) {
          throw new Error('Invalid ollama URI: missing base URL or model name');
        }

        return new OllamaModel(`http://${baseUrl}`, modelName);
      }

      case 'groq': {
        const [apiKey, modelName] = parameters.split('/');
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

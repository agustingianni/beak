import { ChatOpenAI } from '@langchain/openai';
import { LLMModel } from './index.js';

// Most hosted inference services (OpenRouter, DeepInfra, Together, Fireworks,
// Featherless) expose the OpenAI chat completions API, so they only differ by
// base URL. Adding one is a new case in ModelFactory, not a new class.
export class OpenAICompatibleModel implements LLMModel {
  private model: ChatOpenAI;

  // IRC lines are short, but some models will happily generate thousands of
  // tokens of fake channel transcript from a chat prompt. Cap it by default.
  constructor(baseUrl: string, apiKey: string, model: string, temperature = 0.9, maxTokens = 300) {
    this.model = new ChatOpenAI({
      apiKey,
      model,
      temperature,
      maxTokens,
      configuration: { baseURL: baseUrl }
    });
  }

  async invoke(prompt: string): Promise<string> {
    try {
      const response = await this.model.invoke(prompt);
      return response.text;
    } catch (error) {
      console.error('Error invoking the OpenAI compatible model:', error);
      throw new Error('Failed to communicate with the language model.');
    }
  }
}

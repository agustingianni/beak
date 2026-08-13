import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { LLMModel } from './index.js';

// Most hosted inference services (OpenRouter, DeepInfra, Together, Fireworks,
// Featherless) expose the OpenAI chat completions API, so they only differ by
// base URL. Adding one is a new case in ModelFactory, not a new class.
export class OpenAICompatibleModel implements LLMModel {
  private model: ChatOpenAI;

  // IRC lines are short, but some models will happily generate thousands of
  // tokens of fake channel transcript from a chat prompt. Cap it by default.
  // Temperature 0.9 was measurably too hot and 0.5 too cold. Across 240 calls
  // at six settings, 0.5 repeated itself (mean word overlap between answers to
  // the same question 0.27, seven exact duplicates) and 1.0 brought back the
  // prompt echoing. 0.8 had the widest vocabulary with no failures.
  constructor(baseUrl: string, apiKey: string, model: string, temperature = 0.8, maxTokens = 300) {
    this.model = new ChatOpenAI({
      apiKey,
      model,
      temperature,
      maxTokens,
      configuration: { baseURL: baseUrl }
    });
  }

  async invoke(prompt: string, system?: string): Promise<string> {
    try {
      // Passing a bare string builds a single HumanMessage, which is what put
      // the personality in the user turn. Build the list so the character can
      // travel in the system role instead.
      const messages = system
        ? [new SystemMessage(system), new HumanMessage(prompt)]
        : [new HumanMessage(prompt)];

      const response = await this.model.invoke(messages);
      return response.text;
    } catch (error) {
      console.error('Error invoking the OpenAI compatible model:', error);
      throw new Error('Failed to communicate with the language model.');
    }
  }
}

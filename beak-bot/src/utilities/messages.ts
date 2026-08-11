// Reasoning models put their scratchpad in a <think> block before the answer.
// The block spans several lines, so this cannot use "." to match its contents.
function removeThinkBlock(input: string): string {
  return input.replace(/<think>[\s\S]*?<\/think>/gi, '');
}

export class OutputMessage {
  static cleanup(response: string, botName: string): string {
    // Drop the reasoning scratchpad if the model emitted one.
    response = removeThinkBlock(response);

    // Map the punctuation models like to emit onto its ASCII equivalent. Deleting
    // it outright glues words together: "goose—just" became "goosejust".
    response = response
      .replace(/[‘’‚‛′]/g, "'")
      .replace(/[“”„‟″]/g, '"')
      .replace(/[‐-―−]/g, '-')
      .replace(/…/g, '...')
      .replace(/[  -   　]/g, ' ')
      .replace(/[​-‍﻿]/g, '');

    // Remove whatever is left outside of the ASCII range
    response = response.replace(/[^\x20-\x7E]/g, '');

    // Strip an opening laugh. The model picks this tic up from its own messages
    // in the prompt context and reinforces it: "haha" openers went from 13% of
    // beak's replies to 82% over time. Only strip it when real text follows.
    response = response.replace(
      /^\s*(?:ha(?:ha)*h?|hehe(?:he)*|heh+|lol+|lmao+|rofl)\b[\s,.!]+(?=\S)/i,
      ''
    );

    // Remove bot name
    const firstWord = /^\s*([^\s]*)/;
    const match = response.match(firstWord);

    if (match) {
      const firstWord = match[1]!;
      const name = new RegExp(botName, 'i');

      // Remove bot name.
      if (name.test(firstWord)) {
        response = response.replace(firstWord, '');
      }
    }

    // Remove leading and trailing quotes
    response = response.trim().replace(/^['"`]+|['"`]+$/g, '');

    return response;
  }
}

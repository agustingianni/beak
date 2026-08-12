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

    // Models like to prefix a reply with their own nickname. Strip that, but
    // match the whole word: testing for the name as a substring ate any word
    // that merely contained it, turning "beaker" into "".
    const name = botName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    response = response.replace(new RegExp(`^\\s*${name}\\b[\\s,:;>-]*`, 'i'), '');

    response = response.trim();

    // Unwrap a fully quoted reply. Stripping each end independently mangled
    // anything that merely opened with a quote: "suck by beak"? became
    // suck by beak"?. Only unwrap when the quote appears exactly twice, so a
    // reply like "a" and "b" is left alone.
    const first = response.at(0);
    const last = response.at(-1);
    if (first && first === last && `'"\``.includes(first)) {
      if (response.split(first).length - 1 === 2) {
        response = response.slice(1, -1).trim();
      }
    }

    return response;
  }
}

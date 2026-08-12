// Reasoning models put their scratchpad in a <think> block before the answer.
// The block spans several lines, so this cannot use "." to match its contents.
function removeThinkBlock(input: string): string {
  return input.replace(/<think>[\s\S]*?<\/think>/gi, '');
}

// The model learns this tic from its own messages in the prompt, so it has to
// be removed on the way in as well as on the way out. Only strips when real
// text follows, leaving a bare "haha", and "lolcode" and "hardcore", alone.
export function stripOpeningLaugh(input: string): string {
  return input.replace(/^\s*(?:ha(?:ha)*h?|hehe(?:he)*|heh+|lol+|lmao+|rofl)\b[\s,.!]+(?=\S)/i, '');
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

    // Strip an opening laugh on the way out. See stripOpeningLaugh above.
    response = stripOpeningLaugh(response);

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

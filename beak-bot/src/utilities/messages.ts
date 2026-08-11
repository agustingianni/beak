export class OutputMessage {
  static cleanup(response: string, botName: string): string {
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

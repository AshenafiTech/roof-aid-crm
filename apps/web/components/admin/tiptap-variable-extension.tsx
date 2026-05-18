"use client";

// Custom Mention configuration that renders `{{token}}` placeholders as
// styled chips in the editor and serializes back to `{{token}}` text.
// We deliberately disable the suggestion popup — variables are inserted
// via the toolbar dropdown, not by typing `@`.

import Mention from "@tiptap/extension-mention";

export const VariableMention = Mention.extend({
  name: "mention",
  // Re-using the "mention" node name keeps it compatible with the
  // tiptap-to-blocks converter and any default schema utilities.
  renderHTML({ node, HTMLAttributes }) {
    const id = (node.attrs as { id?: string }).id ?? "";
    return [
      "span",
      {
        ...HTMLAttributes,
        "data-mention": id,
        class:
          "inline-flex items-center rounded-md bg-orange-100 px-1.5 py-0.5 text-[0.85em] font-medium text-orange-900 dark:bg-orange-900/40 dark:text-orange-100",
      },
      `{{${id}}}`,
    ];
  },
}).configure({
  // We don't use the type-to-suggest popup; toolbar inserts directly.
  suggestion: {
    char: "\0", // a char users won't type, effectively disabling autocomplete
    items: () => [],
    render: () => ({}),
  },
});

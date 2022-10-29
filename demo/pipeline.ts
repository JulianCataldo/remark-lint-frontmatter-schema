/* Launch with `pnpm pipeline` */

import { remark } from 'remark';
import remarkFrontmatter from 'remark-frontmatter';
import remarkLintFrontmatterSchema from 'remark-lint-frontmatter-schema';
import type { JSONSchema7 } from 'json-schema';
import { reporter } from 'vfile-reporter';

console.log('Demo pipeline starting!…\n');

const mySchema: JSONSchema7 = {
  properties: {
    title: {
      type: 'string',
    },
  },
};

const mdContent = `---
title: 2
---

# Hey !`;

const output = await remark()
  // Your pipeline (basic example)
  // …
  .use(remarkFrontmatter)

  .use(remarkLintFrontmatterSchema, {
    /* Bring your own schema */
    embed: mySchema,
  })
  .process(mdContent);

/* `path` is for debugging purpose here, as MD literal comes from your app. */
output.path = './the-current-processed-md-file.md';

console.error(reporter([output]));

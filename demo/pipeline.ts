/* Launch with `pnpm pipeline` */

import { remark } from 'remark';
import remarkFrontmatter from 'remark-frontmatter';
import remarkLintFrontmatterSchema from 'remark-lint-frontmatter-schema';
import type { JSONSchema7 } from 'json-schema';
import { reporter } from 'vfile-reporter';
/* —————————————————————————————————————————————————————————————————————————— */

const mySchema: JSONSchema7 = {
  allOf: [
    {
      /* Works with local / remote, YAML / JSON */
      $ref: './content/page.schema.yaml',
      // $ref: 'https://raw.githubusercontent.com/JulianCataldo/remark-lint-frontmatter-schema/master/demo/content/page.schema.yaml',
    },
    {
      properties: {
        baz: {
          type: 'string',
        },
      },
    },
  ],
};

/* ·········································································· */

const mdContent = `---
$schema: './content/creative-work.schema.yaml'
title: 1234
baz: ['wrong']
---

# Hey !`;

/* ·········································································· */

console.log('Demo pipeline starting!…\n');

const output = await remark()
  // Your pipeline (basic example)
  // …
  .use(remarkFrontmatter)

  .use(remarkLintFrontmatterSchema, {
    /* Bring your own schema */
    // embed: mySchema,
    //
    /* Override default AJV options */
    // ajvOptions: {
    // },
    /* —Or— just (local only) */
    // embed: {
    //   ...mySchema,
    // },
  })
  .process(mdContent);

/* ·········································································· */

output.path = import.meta.url;
// Or if you like, for easier referencing:
// output.path = mySchema.$id ?? '<No file path>';

console.error(reporter([output]));

/**
 * Yields:
 *
 * ```sh
 * file:///<...>/content/
 *   2:8-2:12  warning  Keyword: type  frontmatter-schema  remark-lint
 * Type: string
 * Schema path:  · ./content/page.schema.yaml/properties/title/type
 *   3:6-3:15  warning  Keyword: type  frontmatter-schema  remark-lint
 * Type: string
 * Schema path:  · #/allOf/1/properties/baz/type
 *
 * ⚠ 2 warnings
 * ```
 *
 */

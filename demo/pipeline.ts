/* Launch with `pnpm pipeline` */

import { remark } from 'remark';
import remarkFrontmatter from 'remark-frontmatter';
import remarkLintFrontmatterSchema from 'remark-lint-frontmatter-schema';
import type { JSONSchema7 } from 'json-schema';
import { reporter } from 'vfile-reporter';
/* ·········································································· */
import yaml from 'yaml';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
/* —————————————————————————————————————————————————————————————————————————— */

const mySchema: JSONSchema7 = {
  /* Set current schema absolute `file:///` URI,
     so AJV can resolve relative `$ref`. */

  /* (Optional) For easier referencing, put the embedded schema name */
  /*               \————————————v                                    */
  $id: new URL('content/<optional>', import.meta.url).toString(),

  allOf: [
    { $ref: './page.schema.yaml' },
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
    embed: mySchema,

    /* Override default options so we can resolve `$ref`, etc. */
    ajvOptions: {
      loadSchema(uri) {
        /* Load external referenced schema relatively from schema path */
        return new Promise((resolve, reject) => {
          /* We use local file here, but you could use anything (fetch…) */
          readFile(fileURLToPath(uri), 'utf8')
            .then((data) => {
              try {
                const parsedSchema = yaml.parse(data) as unknown;
                if (parsedSchema && typeof parsedSchema === 'object') {
                  resolve(parsedSchema);
                }
              } catch (_) {
                reject(new Error(`Could not parse ${uri}`));
              }
            })
            .catch((_) => {
              reject(new Error(`Could not locate ${uri}`));
            });
        });
      },
    },

    /* —Or— just (local only) */
    // embed: {
    //   $id: pathToFileURL(mySchemaPath).toString(),
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

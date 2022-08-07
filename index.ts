/* ——————————————————————————————————————————————————————————————————————————— *
 *              © Julian Cataldo — https://www.juliancataldo.com.              *
 *                      See LICENSE in the project root.                       *
/* —————————————————————————————————————————————————————————————————————————— */

import fs from 'node:fs';
import path from 'node:path';
/* ·········································································· */
import yaml from 'yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
/* ·········································································· */
import { VFileMessage } from 'vfile-message';
import { lintRule } from 'unified-lint-rule';
import type { Node } from 'unist';
import type { VFile } from 'unified-lint-rule/lib';
/* —————————————————————————————————————————————————————————————————————————— */
// FIXME: find correct source type instead of overloading this one
type NodeWithChildren = Node & { children?: { value: string }[] };
type Frontmatter = { $schema?: string; [key: string]: any };
/* ·········································································· */

/* Setup AJV (Another JSON-Schema Validator) */
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

function validateFrontmatter(rawYaml: string, file: VFile) {
  /* Parse the YAML string, previously extracted by `remark-frontmatter` */
  const data: Frontmatter = yaml.parse(rawYaml);

  /* Get the user-defined YAML `$schema` for current Markdown file */
  const schemaPath = data.$schema;
  /* Path is combined with process current working directory */
  const schemaFullPath = path.join(process.cwd(), schemaPath);
  const schema = yaml.parse(
    // IDEA: make it async?
    fs.readFileSync(schemaFullPath, 'utf-8'),
  );
  /* `$schema` is now extracted, remove it so it will not interfere */
  delete data.$schema;

  /* JSON Schema compilation + validation with AJV */
  const validate = ajv.compile(schema);
  validate(data);

  /* Push JSON Schema validation failures messages */
  validate?.errors?.forEach((error) => {
    /* Capitalize error message */
    const errMessage =
      `${error.message.charAt(0).toUpperCase()}` +
      `${error.message.substring(1)}`;
    /* Parent or sub-property error */
    const reason = error.instancePath
      ? `${error.instancePath}: ${errMessage}`
      : errMessage;

    const message = new VFileMessage(
      reason,
      // TODO: find a way to map code range to validation errors
      // position,
      null,
      // NOTE: `origin` doesn't seems to be leveraged by anything
      // 'origin',
    );

    /* Assemble and format pretty per-error insights for end-user */
    message.note = yaml
      .stringify({
        keyword: error.keyword,
        params: error.params,
        $schema: `${schemaPath}/${error.schemaPath}`,
      })
      .trim();
    // FIXME: beware that this is not working correctly with `auto-fix`,
    // can be dangerous (wrong code range)!
    message.expected = error?.params?.allowedValues;

    file.messages.push(message);
  });
}

const remarkFrontmatterSchema = lintRule(
  {
    origin: 'remark-lint:frontmatter-schema',
    url: 'https://github.com/JulianCataldo/remark-lint-frontmatter-schema',
  },
  (ast: NodeWithChildren, file) => {
    /* Handle only if the current Markdown file has a frontmatter section */
    if (Array.isArray(ast?.children)) {
      if (ast.children[0]?.value) {
        validateFrontmatter(ast.children[0]?.value, file);
      }
    }
  },
);

export default remarkFrontmatterSchema;

import fs from 'fs';
import path from 'path';
/* ·········································································· */
import yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
/* ·········································································· */
import { VFileMessage } from 'vfile-message';
import { lintRule } from 'unified-lint-rule';
import type { Node } from 'unist';
/* —————————————————————————————————————————————————————————————————————————— */
// FIXME: find correct source type instead of overloading this one
type NodeWithChildren = Node & { children?: { value: string }[] };
type Frontmatter = { $schema?: string; [key: string]: any };
/* ·········································································· */

const remarkFrontmatterSchema = lintRule(
  {
    origin: 'remark-lint:frontmatter-schema',
    url: 'https://github.com/JulianCataldo/remark-lint-frontmatter-schema',
  },
  (ast: NodeWithChildren, file) => {
    const raw = ast?.children[0].value;
    const data: Frontmatter = yaml.load(raw);
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);

    const schemaPath = data.$schema;

    // IDEA: make it async?
    const schema = yaml.load(
      fs.readFileSync(path.join(process.cwd(), data.$schema), 'utf-8'),
    );
    delete data.$schema;

    const validate = ajv.compile(schema);

    validate(data);

    /* Push JSON Schema validation failures messages */
    validate?.errors?.forEach((error) => {
      const errMessage =
        `${error.message.charAt(0).toUpperCase()}` +
        `${error.message.substring(1)}`;
      const reason = error.instancePath
        ? `${error.instancePath}: ${errMessage}`
        : errMessage;

      const msg = new VFileMessage(
        reason,
        // TODO: find a way to map code range to validation errors
        // position,
        null,
        'Here',
      );

      msg.note = yaml
        .dump({
          keyword: error.keyword,
          params: error.params,
          $schema: `${schemaPath}/${error.schemaPath}`,
        })
        .trim();

      // FIXME: beware that this is not working correctly with `auto-fix`,
      // can be dangerous (wrong code range)!
      msg.expected = error?.params?.allowedValues;

      file.messages.push(msg);
    });
  },
);

export default remarkFrontmatterSchema;

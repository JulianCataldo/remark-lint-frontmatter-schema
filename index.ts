import fs from 'node:fs';
import path from 'node:path';
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

/* Setup AJV (Another JSON-Schema Validator) */
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const remarkFrontmatterSchema = lintRule(
  {
    origin: 'remark-lint:frontmatter-schema',
    url: 'https://github.com/JulianCataldo/remark-lint-frontmatter-schema',
  },
  (ast: NodeWithChildren, file) => {
    /* Parse the YAML string, previously extracted by `remark-frontmatter` */
    const rawYaml = ast?.children[0].value;
    const data: Frontmatter = yaml.load(rawYaml);

    /* Get the user-defined YAML `$schema` for current Markdown file */
    const schemaPath = data.$schema;
    /* Path is combined with process current working directory */
    const schemaFullPath = path.join(process.cwd(), schemaPath);
    const schema = yaml.load(
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
      message.note = yaml
        .dump({
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
  },
);

export default remarkFrontmatterSchema;

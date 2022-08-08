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
import { Position, VFileMessage } from 'vfile-message';
import { lintRule } from 'unified-lint-rule';
import type { VFile } from 'unified-lint-rule/lib';
import { location } from 'vfile-location';
import type { Root, YAML } from 'mdast';
/* —————————————————————————————————————————————————————————————————————————— */
type Frontmatter = { $schema?: string; [key: string]: unknown };
/* ·········································································· */

/* Setup AJV (Another JSON-Schema Validator) */
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

function validateFrontmatter(rawYaml: string, vFile: VFile) {
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
    /* Root -OR- sub-path error? */
    const reason = error.instancePath
      ? `${error.instancePath}: ${errMessage}`
      : errMessage;

    /* Get YAML Abstract Syntax Tree */
    const doc = yaml.parseDocument(rawYaml);

    // FIXME: if possible, find correct source types instead of recreating them
    type Range = [number, number, number];
    interface NodeInfos {
      value: number;
      range: Range;
      source: string;
      type: string;
    }
    /* Explode AJV error instance path and get corresponding YAML AST node */
    const ajvPath = error.instancePath.substring(1).split('/');
    const obs = doc.getIn(ajvPath, true) as NodeInfos | undefined;

    /* Map YAML characters range to column / line positions */
    /* Squiggle the opening frontmatter fence for root path errors */
    let position: Position | null;

    if (obs) {
      const place = location(vFile);

      const openingFenceLength = 4; /* Take the `---` into account */
      const startChar = obs.range[0] + openingFenceLength;
      const endChar = obs.range[1] + openingFenceLength;

      const start = place.toPoint(startChar);
      const end = place.toPoint(endChar);
      position = { start, end };
    }

    const message = new VFileMessage(reason, position);

    /* Assemble and format pretty per-error insights for end-user */
    message.note = yaml
      .stringify({
        keyword: error.keyword,
        params: error.params,
        $schema: `${schemaPath}/${error.schemaPath}`,
      })
      .trim();

    /* Auto-fix replacement suggestions */
    message.expected = error?.params?.allowedValues;

    vFile.messages.push(message);
  });
}

const remarkFrontmatterSchema = lintRule(
  {
    origin: 'remark-lint:frontmatter-schema',
    url: 'https://github.com/JulianCataldo/remark-lint-frontmatter-schema',
  },
  (ast: Root, vFile) => {
    /* Handle only if the current Markdown file has a frontmatter section */
    if (ast.children.length) {
      /** IDEA: is the `0` due to the fact that `remark-frontmatter`
       * could parse multi-parts frontmatter? Should investigate. */
      if (ast.children[0].type === 'yaml') {
        validateFrontmatter(ast.children[0].value, vFile);
      }
    }
  },
);

export default remarkFrontmatterSchema;

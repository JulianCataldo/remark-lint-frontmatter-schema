/* ——————————————————————————————————————————————————————————————————————————— *
 *              © Julian Cataldo — https://www.juliancataldo.com.              *
 *                      See LICENSE in the project root.                       *
/* —————————————————————————————————————————————————————————————————————————— */

import fs from 'node:fs';
import path from 'node:path';
/* ·········································································· */
import yaml, { Document, isNode } from 'yaml';
import Ajv, { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
/* ·········································································· */
import { Position } from 'vfile-message';
import { lintRule } from 'unified-lint-rule';
import type { VFile } from 'unified-lint-rule/lib';
import { location } from 'vfile-location';
import type { Root, YAML } from 'mdast';
/* —————————————————————————————————————————————————————————————————————————— */

/* Setup AJV (Another JSON-Schema Validator) */
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

function pushErrors(
  errors: ErrorObject[],
  yamlDoc: Document,
  vFile: VFile,
  /** The user-defined `$schema` value */
  schemaRelPath: string,
) {
  errors.forEach((error) => {
    /* Capitalize error message */
    const errMessage =
      `${error.message.charAt(0).toUpperCase()}` +
      `${error.message.substring(1)}`;
    /* Sub-path -OR- Root error? */
    const reason = error.instancePath
      ? `${error.instancePath}: ${errMessage}`
      : errMessage;

    /* Explode AJV error instance path and get corresponding YAML AST node */
    const ajvPath = error.instancePath.substring(1).split('/');
    const node = yamlDoc.getIn(ajvPath, true);

    /* Map YAML characters range to column / line positions,
       -OR- squiggling the opening frontmatter fence for **root** path errors */
    let position: Position | null;

    if (isNode(node)) {
      // NOTE: maybe `location` isn't needed to get the correct positions
      const place = location(vFile);

      const openingFenceLength = 4; /* Take the `---` into account */
      const startChar = node.range[0] + openingFenceLength;
      const endChar = node.range[1] + openingFenceLength;

      const start = place.toPoint(startChar);
      const end = place.toPoint(endChar);
      position = { start, end };
    }

    const message = vFile.message(reason, position);

    /* Assemble pretty per-error insights for end-user.
       Using `yaml.stringify` for pure formatting purpose here */
    message.note = yaml
      .stringify({
        keyword: error.keyword,
        params: error.params,
        $schema: `${schemaRelPath}/${error.schemaPath}`,
      })
      .trim();

    /* Auto-fix replacement suggestions for `enum` */
    message.expected = error?.params?.allowedValues;
  });
}

function validateFrontmatter(sourceYaml: YAML, vFile: VFile) {
  let yamlDoc;
  let yamlJS;
  let hasSchemaKey = false;

  /* Parse the YAML literal and get the YAML Abstract Syntax Tree,
     previously extracted by `remark-frontmatter` */
  try {
    yamlDoc = yaml.parseDocument(sourceYaml.value);
    yamlJS = yamlDoc.toJS();
    hasSchemaKey = typeof yamlJS?.$schema === 'string';
  } catch (e) {
    /* NOTE: Never hitting this error.
       Parser seems to handle anything we throw at it. */
    const msg = `YAML frontmatter parse error`;
    vFile.message(msg);
  }

  /* Get the user-defined YAML `$schema` for current Markdown file */
  if (yamlDoc && yamlJS && hasSchemaKey) {
    const schemaRelPath = yamlJS.$schema;
    /* Path is combined with the process / workspace root directory,
         where the `.remarkrc.mjs` should live. */
    const schemaFullPath = path.join(vFile.cwd, schemaRelPath);
    const schemaExists = fs.existsSync(schemaFullPath);

    if (schemaExists) {
      // IDEA: make it async?
      let schema;
      try {
        const fileData = fs.readFileSync(schemaFullPath, 'utf-8');
        schema = yaml.parse(fileData);
        /* Schema is now extracted,
           remove `$schema` key, so it will not interfere later */
        delete yamlJS.$schema;
      } catch (e) {
        const msg = `YAML Schema parse error: ${schemaRelPath}`;
        // TODO: make a meaningful error with `linePos` etc.
        vFile.message(msg);
      }

      /* JSON Schema compilation + validation with AJV */
      if (schema) {
        try {
          const validate = ajv.compile(schema);
          validate(yamlJS);

          /* Push JSON Schema validation failures messages */
          if (validate?.errors.length) {
            pushErrors(validate.errors, yamlDoc, vFile, schemaRelPath);
          }
        } catch (e) {
          const msg = `JSON Schema malformed: ${schemaRelPath}`;
          // TODO: make a meaningful error with `linePos` etc.
          vFile.message(msg);
        }
      }
    } else {
      const msg = `Schema not found: ${schemaFullPath}`;
      vFile.message(msg);
    }
  }
}

const remarkFrontmatterSchema = lintRule(
  {
    origin: 'remark-lint:frontmatter-schema',
    url: 'https://github.com/JulianCataldo/remark-lint-frontmatter-schema',
  },
  (ast: Root, vFile: VFile) => {
    /* Handle only if the current Markdown file has a frontmatter section */
    if (ast.children.length) {
      /* IDEA: is the `0` due to the fact that `remark-frontmatter`
         could provide multi-parts frontmatter? Should investigate this. */
      if (ast.children[0].type === 'yaml') {
        validateFrontmatter(ast.children[0], vFile);
      }
    }
  },
);

export default remarkFrontmatterSchema;

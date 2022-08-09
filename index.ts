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
import globToRegExp from 'glob-to-regexp';
/* ·········································································· */
import { Position } from 'vfile-message';
import { location } from 'vfile-location';
import { lintRule } from 'unified-lint-rule';
import type { VFile } from 'unified-lint-rule/lib';
import type { Root, YAML } from 'mdast';
/* —————————————————————————————————————————————————————————————————————————— */
export interface Settings {
  /**
   * Example: `'schemas/thing.schema.yaml': ['content/things/*.md']`
   */
  schemas?: {
    [key: string]: string[];
  };
}
/* ·········································································· */

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

    /* Assemble pretty per-error insights for end-user. */
    message.note =
      `Keyword: ${error.keyword}\n` +
      `${
        error.params?.allowedValues
          ? `Allowed values: ${error.params.allowedValues.join(', ')}`
          : ''
      }${
        error.params?.missingProperty
          ? `Missing property: ${error.params.missingProperty}`
          : ''
      }${error.params?.type ? `Type: ${error.params.type}` : ''}\n` +
      `Schema: ${schemaRelPath}${error.schemaPath}`;

    /* Auto-fix replacement suggestions for `enum` */
    message.expected = error?.params?.allowedValues;
  });
}

function validateFrontmatter(
  sourceYaml: YAML,
  vFile: VFile,
  settings: Settings,
) {
  const hasGlobalSettings = typeof settings.schemas === 'object';
  let yamlDoc;
  let yamlJS;
  let hasLocalAssoc = false;
  let fromGlobalAssoc = false;
  let schemaRelPath;

  /* Parse the YAML literal and get the YAML Abstract Syntax Tree,
     previously extracted by `remark-frontmatter`. */
  try {
    yamlDoc = yaml.parseDocument(sourceYaml.value);
    yamlJS = yamlDoc.toJS();

    /* Local `$schema` association takes precedence over global mapping */
    hasLocalAssoc = typeof yamlJS?.$schema === 'string';
    if (hasLocalAssoc) {
      schemaRelPath = yamlJS.$schema;
    }
  } catch (e) {
    /* NOTE: Never hitting this error.
       Parser seems to handle anything we throw at it. */
    const msg = `YAML frontmatter parse error`;
    vFile.message(msg);
  }

  /* Global schemas associations, only if no local schema is set */
  if (yamlDoc && yamlJS && hasLocalAssoc === false && hasGlobalSettings) {
    Object.entries(settings.schemas).forEach(
      ([globSchemaPath, globSchemaAssocs]) => {
        if (Array.isArray(globSchemaAssocs)) {
          globSchemaAssocs.forEach((mdFilePath) => {
            /* Check if current markdown file is associated with this schema */
            if (typeof mdFilePath === 'string') {
              /* Remove appended `./` or `/` */
              const mdPathCleaned = path.join(mdFilePath);

              const globber = globToRegExp(mdPathCleaned);
              if (globber.test(vFile.path)) {
                fromGlobalAssoc = true;
                schemaRelPath = globSchemaPath;
              }
            }
          });
        }
      },
    );
  }

  /* We got an associated schema to work with */
  if (hasLocalAssoc || fromGlobalAssoc) {
    /* Path is combined with the process / workspace root directory,
       where the `.remarkrc.mjs` should live. */
    const schemaFullPath = path.join(vFile.cwd, schemaRelPath);
    const schemaExists = fs.existsSync(schemaFullPath);

    if (schemaExists) {
      let schema;
      try {
        // IDEA: make it async?
        const fileData = fs.readFileSync(schemaFullPath, 'utf-8');
        schema = yaml.parse(fileData);
        /* Schema is now extracted,
           remove local `$schema` key, so it will not interfere later */
        if (hasLocalAssoc) {
          delete yamlJS.$schema;
        }
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
  (ast: Root, vFile: VFile, settings: Settings) => {
    /* Handle only if the current Markdown file has a frontmatter section */
    if (ast.children.length) {
      /* IDEA: is the `0` due to the fact that `remark-frontmatter`
         could provide multi-parts frontmatter? Should investigate this. */
      if (ast.children[0].type === 'yaml') {
        validateFrontmatter(ast.children[0], vFile, settings);
      }
    }
  },
);

export default remarkFrontmatterSchema;

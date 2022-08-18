/* ——————————————————————————————————————————————————————————————————————————— *
 *              © Julian Cataldo — https://www.juliancataldo.com.              *
 *                      See LICENSE in the project root.                       *
/* —————————————————————————————————————————————————————————————————————————— */

import fs from 'node:fs';
import path from 'node:path';
import globToRegExp from 'glob-to-regexp';
/* ·········································································· */
import yaml, { isNode } from 'yaml';
import type { Document } from 'yaml';
import Ajv from 'ajv';
import type { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import type { JSONSchema7 } from 'json-schema';
/* ·········································································· */
import { Position } from 'vfile-message';
import { location } from 'vfile-location';
import { lintRule } from 'unified-lint-rule';
import type { VFile } from 'unified-lint-rule/lib';
import type { Root, YAML } from 'mdast';
/* —————————————————————————————————————————————————————————————————————————— */
export interface Settings {
  /**
   * Global workspace file associations mapping (for linter extension).
   *
   * Example: `'schemas/thing.schema.yaml': ['content/things/*.md']`
   */
  schemas?: {
    [key: string]: string[];
  };
  /**
   * Direct schema embedding (for using inside an `unified` transform pipeline).
   *
   * Format: JSON Schema - draft-2019-09
   */
  embed?: JSONSchema7;
}
/* ·········································································· */

/* Setup AJV (Another JSON-Schema Validator) */
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

function pushErrors(
  errors: ErrorObject[],
  yamlDoc: Document,
  vFile: VFile,
  /** Local `$schema` key or from global settings */
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
  const hasGlobalSettings = typeof settings?.schemas === 'object';
  const hasPropSchema = typeof settings?.embed === 'object';
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

    /* Local `$schema` association takes precedence over global / prop. */
    hasLocalAssoc = typeof yamlJS?.$schema === 'string';
    if (hasLocalAssoc) {
      schemaRelPath = yamlJS.$schema;
    }
  } catch (_) {
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

  /* From file only */
  let fileSchemaExists;
  let schemaFullPath;
  if (hasLocalAssoc || fromGlobalAssoc) {
    /* Path is combined with the process / workspace root directory,
       where the `.remarkrc.mjs` should live. */
    schemaFullPath = path.join(vFile.cwd, schemaRelPath);
    fileSchemaExists = fs.existsSync(schemaFullPath);
  }

  let schema;
  if (hasPropSchema) {
    schema = settings.embed;
  } else if (fileSchemaExists) {
    try {
      // IDEA: make it async?
      const fileData = fs.readFileSync(schemaFullPath, 'utf-8');
      schema = yaml.parse(fileData);
      /* Schema is now extracted,
      remove local `$schema` key, so it will not interfere later */
      if (hasLocalAssoc) {
        delete yamlJS.$schema;
      }
    } catch (_) {
      const msg = `YAML Schema parse error: ${schemaRelPath}`;
      // TODO: make a meaningful error with `linePos` etc.
      vFile.message(msg);
    }
  }

  /* We got an extracted schema to work with */
  if (schema) {
    /* JSON Schema compilation + validation with AJV */
    try {
      const validate = ajv.compile(schema);
      validate(yamlJS);

      /* Push JSON Schema validation failures messages */
      if (validate?.errors?.length) {
        pushErrors(validate.errors, yamlDoc, vFile, schemaRelPath);
      }
    } catch (_) {
      const msg = `JSON Schema malformed: ${schemaRelPath}`;
      // TODO: make a meaningful error with `linePos` etc.
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

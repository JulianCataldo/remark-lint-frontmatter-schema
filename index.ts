/* ——————————————————————————————————————————————————————————————————————————— *
 *              © Julian Cataldo — https://www.juliancataldo.com.              *
 *                      See LICENSE in the project root.                       *
/* —————————————————————————————————————————————————————————————————————————— */

import fs from 'node:fs';
import path from 'node:path';
import globToRegExp from 'glob-to-regexp';
/* ·········································································· */
import yaml, { isNode, LineCounter } from 'yaml';
import type { Document } from 'yaml';
import Ajv from 'ajv';
import type { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import type { JSONSchema7 } from 'json-schema';
/* ·········································································· */
import type { Position } from 'vfile-message';
import { lintRule } from 'unified-lint-rule';
import type { VFile } from 'unified-lint-rule/lib';
import type { Root, YAML } from 'mdast';
/* ·········································································· */
import { homepage } from './package.json' assert { type: 'json' };
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
  /** File path from local `$schema` key or from global settings */
  schemaRelPath: string,
  /** Used to map character range to line / column tuple */
  lineCounter: LineCounter,
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
      const OPENING_FENCE_LINE_COUNT = 1; /* Takes the `---` into account */

      const start = lineCounter.linePos(node.range[0]);
      const end = lineCounter.linePos(node.range[1]);
      position = {
        start: {
          line: start.line + OPENING_FENCE_LINE_COUNT,
          column: start.col,
        },
        end: {
          line: end.line + OPENING_FENCE_LINE_COUNT,
          column: end.col,
        },
      };
    }

    const message = vFile.message(reason, position);

    /* Assemble pretty per-error insights for end-user */
    let note = `Keyword: ${error.keyword}`;
    if (error.params?.allowedValues) {
      note += `\nAllowed values: ${error.params.allowedValues.join(', ')}`;
    }
    if (error.params?.missingProperty) {
      note += `\nMissing property: ${error.params.missingProperty}`;
    }
    if (error.params?.type) {
      note += `\nType: ${error.params.type}`;
    }
    /* `schemaRelPath` path prefix will show up only when using
        file association, not when using pipeline embedded schema */
    note += `\nSchema path: ${schemaRelPath}${error.schemaPath}`;
    message.note = note;

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
  const lineCounter = new LineCounter();
  let yamlDoc;
  let yamlJS;
  let hasLocalAssoc = false;
  let fromGlobalAssoc = false;
  let schemaRelPath;

  /* Parse the YAML literal and get the YAML Abstract Syntax Tree,
     previously extracted by `remark-frontmatter` */
  try {
    yamlDoc = yaml.parseDocument(sourceYaml.value, { lineCounter });
    yamlJS = yamlDoc.toJS();

    /* Local `$schema` association takes precedence over global / prop */
    hasLocalAssoc = typeof yamlJS?.$schema === 'string';
    if (hasLocalAssoc) {
      schemaRelPath = yamlJS.$schema;
    }
  } catch (_) {
    /* NOTE: Never hitting this error,
       parser seems to handle anything we throw at it */
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
       where the `.remarkrc.mjs` should live */
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
         remove in-file `$schema` key, so it will not interfere later */
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
        pushErrors(validate.errors, yamlDoc, vFile, schemaRelPath, lineCounter);
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
    url: homepage,
  },
  (ast: Root, vFile: VFile, settings: Settings) => {
    /* Handle only if the current Markdown file has a frontmatter section */
    if (ast.children.length) {
      // IDEA: is the `0` due to the fact that `remark-frontmatter`
      // could provide multi-parts frontmatter? Should investigate this
      if (ast.children[0].type === 'yaml') {
        validateFrontmatter(ast.children[0], vFile, settings);
      }
    }
  },
);

export default remarkFrontmatterSchema;

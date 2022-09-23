/* ——————————————————————————————————————————————————————————————————————————— *
 *              © Julian Cataldo — https://www.juliancataldo.com.              *
 *                      See LICENSE in the project root.                       *
/* —————————————————————————————————————————————————————————————————————————— */

/* eslint-disable max-lines */
import fs from 'node:fs';
import path from 'node:path';
import minimatch from 'minimatch';
/* ·········································································· */
import yaml, { isNode, LineCounter } from 'yaml';
import type { Document } from 'yaml';
import Ajv from 'ajv';
import type { Options as AjvOptions, ErrorObject as AjvErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import type { JSONSchema7 } from 'json-schema';
/* ·········································································· */
import type { VFileMessage } from 'vfile-message';
import { lintRule } from 'unified-lint-rule';
import type { VFile } from 'unified-lint-rule/lib';
import type { Root, YAML } from 'mdast';
/* —————————————————————————————————————————————————————————————————————————— */

const url = 'https://github.com/JulianCataldo/remark-lint-frontmatter-schema';
const nativeJsErrorName = 'Markdown YAML frontmatter error (JSON Schema)';

export interface Settings {
  /**
   * Global workspace file associations mapping (for linter extension).
   *
   * Example: `'schemas/thing.schema.yaml': ['content/things/*.md']`
   */
  schemas?: Record<string, string[]>;
  /**
   * Direct schema embedding (for using inside an `unified` transform pipeline).
   *
   * Format: JSON Schema - draft-2019-09
   *
   * **Documentation**: https://ajv.js.org/json-schema.html#draft-07
   */
  embed?: JSONSchema7;
  /**
   * **Documentation**: https://ajv.js.org/options.html
   */
  ajvOptions?: AjvOptions;
}

// IDEA: Might be interesting to populate with corresponding error reference
type JSONSchemaReference = 'https://ajv.js.org/json-schema.html';

export interface FrontmatterSchemaMessage extends VFileMessage {
  schema: AjvErrorObject & { url: JSONSchemaReference };
}

interface FrontmatterObject {
  $schema?: string;
  /* This is the typical Frontmatter object, as treated by common consumers */
  [key: string]: unknown;
}

/* ·········································································· */

function pushErrors(
  errors: AjvErrorObject[],
  yamlDoc: Document,
  vFile: VFile,
  /** File path from local `$schema` key or from global settings */
  schemaRelPath: string,
  /** Used to map character range to line / column tuple */
  lineCounter: LineCounter,
) {
  errors.forEach((error) => {
    let reason = '';

    if (error.message) {
      /* Capitalize error message */
      const errMessage =
        `${error.message.charAt(0).toUpperCase()}` +
        `${error.message.substring(1)}`;
      /* Sub-path -OR- Root error? */
      if (error.instancePath) {
        reason = `${error.instancePath}: ${errMessage}`;
      } else {
        reason = errMessage;
      }
    }

    /* Explode AJV error instance path and get corresponding YAML AST node */
    const ajvPath = error.instancePath.substring(1).split('/');
    const node = yamlDoc.getIn(ajvPath, true);

    const message = vFile.message(reason);

    /* FIXME: Doesn't seems to be used in custom pipeline?
       Always returning `false` */
    message.fatal = true;

    /* `name` comes from native JS `Error` object */
    message.name = nativeJsErrorName;

    /* Map YAML characters range to column / line positions,
       -OR- squiggling the opening frontmatter fence for **root** path errors */
    if (isNode(node)) {
      /* Incriminated token */
      message.actual = node.toString();

      /* Map AJV Range to VFile Position, via YAML lib. parser */
      if (node.range) {
        const OPENING_FENCE_LINE_COUNT = 1; /* Takes the `---` into account */
        const start = lineCounter.linePos(node.range[0]);
        const end = lineCounter.linePos(node.range[1]);
        message.position = {
          start: {
            line: start.line + OPENING_FENCE_LINE_COUNT,
            column: start.col,
          },
          end: {
            line: end.line + OPENING_FENCE_LINE_COUNT,
            column: end.col,
          },
        };
        // NOTE: Seems redundant, but otherwise, it is always set to 1:1 */
        message.line = message.position.start.line;
        message.column = message.position.start.column;
      }
    }

    /* Assemble pretty per-error insights for end-user */
    let note = `Keyword: ${error.keyword}`;
    if (Array.isArray(error.params.allowedValues)) {
      note += `\nAllowed values: ${error.params.allowedValues.join(', ')}`;

      /* Auto-fix replacement suggestions for `enum` */
      message.expected = error.params.allowedValues;
    }
    if (typeof error.params.missingProperty === 'string') {
      note += `\nMissing property: ${error.params.missingProperty}`;
    }
    if (typeof error.params.type === 'string') {
      note += `\nType: ${error.params.type}`;
    }
    /* `schemaRelPath` path prefix will show up only when using
        file association, not when using pipeline embedded schema */
    note += `\nSchema path: ${schemaRelPath} · ${error.schemaPath}`;
    message.note = note;
    /* `message` comes from native JS `Error` object */
    message.message = note;

    /**
     * Adding custom data from AJV
     *
     * It’s OK to store custom data directly on the VFileMessage:
     * https://github.com/vfile/vfile-message#well-known-fields
     *  */
    // NOTE: Might be better to type `message` before, instead of asserting here
    (message as FrontmatterSchemaMessage).schema = {
      url: 'https://ajv.js.org/json-schema.html',
      ...error,
    };
  });
}

function validateFrontmatter(
  sourceYaml: YAML,
  vFile: VFile,
  settings: Settings,
) {
  const hasPropSchema = typeof settings.embed === 'object';
  const lineCounter = new LineCounter();
  let yamlDoc;
  let yamlJS;
  let hasLocalAssoc = false;
  let schemaRelPath: string | null = null;

  /* Parse the YAML literal and get the YAML Abstract Syntax Tree,
     previously extracted by `remark-frontmatter` */
  try {
    yamlDoc = yaml.parseDocument(sourceYaml.value, { lineCounter });
    yamlJS = yamlDoc.toJS() as FrontmatterObject;

    /* Local `$schema` association takes precedence over global / prop. */
    if (yamlJS.$schema && typeof yamlJS.$schema === 'string') {
      hasLocalAssoc = true;
      schemaRelPath = yamlJS.$schema;
    }
  } catch (_) {
    /* NOTE: Never hitting this error,
       parser seems to handle anything we throw at it */
    const msg = `YAML frontmatter parse error`;
    vFile.message(msg);
  }

  /* Global schemas associations, only if no local schema is set */
  if (typeof settings.schemas === 'object') {
    if (yamlDoc && yamlJS && !hasLocalAssoc) {
      Object.entries(settings.schemas).forEach(
        ([globSchemaPath, globSchemaAssocs]) => {
          if (Array.isArray(globSchemaAssocs)) {
            /* Check if current markdown file is associated with this schema */
            globSchemaAssocs.forEach((mdFilePath) => {
              if (typeof mdFilePath === 'string') {
                /* Remove appended `./` or `/` */
                const mdPathCleaned = path.join(mdFilePath);

                if (minimatch(vFile.path, mdPathCleaned)) {
                  schemaRelPath = globSchemaPath;
                }
              }
            });
          }
        },
      );
    }
  }

  /* From file only */
  let schemaFullPath;
  if (schemaRelPath) {
    /* Path is combined with the process / workspace root directory,
       where the `.remarkrc.mjs` should live */
    schemaFullPath = path.join(vFile.cwd, schemaRelPath);
  }

  let schema;
  if (hasPropSchema) {
    schema = settings.embed;
  } else if (schemaFullPath) {
    try {
      // IDEA: make it async?
      const fileData = fs.readFileSync(schemaFullPath, 'utf-8');
      // TODO: Validate schema with JSON meta schema
      schema = yaml.parse(fileData) as unknown as JSONSchema7;
      /* Schema is now extracted,
         remove in-file `$schema` key, so it will not interfere later */
      if (hasLocalAssoc) {
        if (yamlJS && typeof yamlJS.$schema === 'string') {
          delete yamlJS.$schema;
        }
      }
    } catch (_) {
      const msg = `YAML Schema parse error: ${schemaRelPath ?? ''}`;
      // TODO: Make a meaningful error with `linePos` etc.
      vFile.message(msg);
    }
  }

  /* We got an extracted schema to work with */
  if (schema && yamlDoc) {
    /* Setup AJV (Another JSON-Schema Validator) */
    const ajv = new Ajv({
      /* Defaults */
      allErrors: true /* So it doesn't stop at the first found error */,
      strict: false /* Prevents warnings for valid, but relaxed schemas */,
      /* User override */
      ...settings.ajvOptions,
    });
    addFormats(ajv);

    /* JSON Schema compilation + validation with AJV */
    try {
      const validate = ajv.compile(schema);
      validate(yamlJS);

      /* Push JSON Schema validation failures messages */
      if (validate.errors?.length) {
        pushErrors(
          validate.errors,
          yamlDoc,
          vFile,
          schemaRelPath ?? '',
          lineCounter,
        );
      }
    } catch (_) {
      const msg = `JSON Schema malformed: ${schemaRelPath ?? ''}`;
      // TODO: Make a meaningful error with `linePos` etc.
      vFile.message(msg);
    }
  }
}

const remarkFrontmatterSchema = lintRule(
  {
    url,
    origin: 'remark-lint:frontmatter-schema',
  },
  (ast: Root, vFile: VFile, settings: Settings) => {
    /* Handle only if the current Markdown file has a frontmatter section */
    if (ast.children.length) {
      // IDEA: Is the `0` due to the fact that `remark-frontmatter`
      // could provide multi-parts frontmatter? Should investigate this
      if (ast.children[0].type === 'yaml') {
        validateFrontmatter(ast.children[0], vFile, settings);
      }
    }
  },
);

export default remarkFrontmatterSchema;

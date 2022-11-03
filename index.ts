/* ——————————————————————————————————————————————————————————————————————————— *
 *              © Julian Cataldo — https://www.juliancataldo.com.              *
 *                      See LICENSE in the project root.                       *
/* —————————————————————————————————————————————————————————————————————————— */

/* eslint-disable max-lines */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { findUp } from 'find-up';
import minimatch from 'minimatch';
/* ·········································································· */
import yaml, { type Document, isNode, LineCounter } from 'yaml';
import Ajv from 'ajv';
import type { Options as AjvOptions, ErrorObject as AjvErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import type { JSONSchema7 } from 'json-schema';
/* ·········································································· */
import { lintRule } from 'unified-lint-rule';
import type { VFile } from 'unified-lint-rule/lib';
import type { Root, YAML } from 'mdast';
import type { VFileMessage } from 'vfile-message';
/* —————————————————————————————————————————————————————————————————————————— */

const url = 'https://github.com/JulianCataldo/remark-lint-frontmatter-schema';
const nativeJsErrorName = 'Markdown YAML frontmatter error (JSON Schema)';

export interface Settings {
  /**
   * Global workspace file associations mapping (for linter extension).
   *
   * **Example**: `'schemas/thing.schema.yaml': ['content/things/*.md']`
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
  $schema: string | undefined;
  /* This is the typical Frontmatter object, as treated by common consumers */
  [key: string]: unknown;
}

/* ·········································································· */

/* The vFile cwd isn't the same as the one from IDE extension.
Extension will cascade upward from the current processed file and
take the remarkrc file as its cwd. It's multi-level workspace
friendly. We have to mimick this behavior here, as remark lint rules doesn't 
seems to offer an API to hook up on this? */
async function getRemarkCwd(startDir: string) {
  const remarkConfigNames = [
    '.remarkrc',
    '.remarkrc.json',
    '.remarkrc.yaml',
    '.remarkrc.yml',
    '.remarkrc.mjs',
    '.remarkrc.js',
    '.remarkrc.cjs',
  ];
  const remarkConfPath = await findUp(remarkConfigNames, {
    cwd: path.dirname(startDir),
  });
  if (remarkConfPath) {
    return path.dirname(remarkConfPath);
  }
  return process.cwd();
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

      let expected = '';
      if (Array.isArray(error.params.allowedValues)) {
        expected = `: \`${error.params.allowedValues.join('`, `')}\``;
      } else if (typeof error.params.allowedValue === 'string') {
        expected = `: \`${error.params.allowedValue}\``;
      }
      const sPath = schemaRelPath ? ` • ${schemaRelPath}` : '';

      reason = `${errMessage}${expected}${sPath} • ${error.schemaPath}`;
    }

    /* Explode AJV error instance path and get corresponding YAML AST node */
    const ajvPath = error.instancePath.substring(1).split('/');
    const node = yamlDoc.getIn(ajvPath, true);

    const message = vFile.message(reason);

    // FIXME: Doesn't seems to be used in custom pipeline?
    // Always returning `false`
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
    } else if (typeof error.params.allowedValue === 'string') {
      note += `\nAllowed value: ${error.params.allowedValue}`;

      /* Auto-fix replacement suggestion for `const` */
      message.expected = [error.params.allowedValue];
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
    message.message = reason;

    /* Adding custom data from AJV */
    /* It’s OK to store custom data directly on the VFileMessage:
      https://github.com/vfile/vfile-message#well-known-fields */
    // NOTE: Might be better to type `message` before, instead of asserting here
    (message as FrontmatterSchemaMessage).schema = {
      url: 'https://ajv.js.org/json-schema.html',
      ...error,
    };
  });
}

/* ·········································································· */

async function validateFrontmatter(
  sourceYaml: YAML,
  vFile: VFile,
  settings: Settings,
) {
  const hasPropSchema = typeof settings.embed === 'object';
  const lineCounter = new LineCounter();
  let yamlDoc;
  let yamlJS;
  let hasLocalAssoc = false;
  let schemaPathFromCwd: string | undefined;
  const remarkCwd = await getRemarkCwd(vFile.path);

  /* Parse the YAML literal and get the YAML Abstract Syntax Tree,
    previously extracted by `remark-frontmatter` */
  try {
    yamlDoc = yaml.parseDocument(sourceYaml.value, { lineCounter });
    yamlJS = yamlDoc.toJS() as FrontmatterObject | null;

    /* Local `$schema` association takes precedence over global / prop. */
    if (yamlJS?.$schema && typeof yamlJS.$schema === 'string') {
      hasLocalAssoc = true;
      /* Fallback if it's an embedded schema (no `path`) */
      const vFilePath = vFile.path || '';

      /* From current processed file directory  (e.g. `./foo…` or `../foo…`) */
      const dirFromCwd = path.isAbsolute(vFilePath)
        ? path.relative(process.cwd(), path.dirname(vFilePath))
        : path.dirname(vFilePath);

      const standardPath = path.join(dirFromCwd, yamlJS.$schema);
      if (existsSync(standardPath)) {
        schemaPathFromCwd = standardPath;
      } else {
        /* Non standard behavior, like TS / Vite, not JSON Schema resolution.
          Resolving `/my/path` or `my/path` from current remark project root */
        schemaPathFromCwd = path.join(remarkCwd, yamlJS.$schema);
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      const banner = `YAML frontmatter parsing: ${schemaPathFromCwd ?? ''}`;
      vFile.message(`${banner} — ${error.name}: ${error.message}`);
    }
  }

  /* ········································································ */

  /* Global schemas associations, only if no local schema is set */
  if (yamlDoc && yamlJS && !hasLocalAssoc) {
    Object.entries(settings.schemas ?? {}).forEach(
      ([globSchemaPath, globSchemaAssocs]) => {
        /* Check if current markdown file is associated with this schema */
        globSchemaAssocs.forEach((mdFilePath) => {
          if (typeof mdFilePath === 'string') {
            const mdPathCleaned = path.normalize(mdFilePath);

            /* With `remark`, `vFile.path` is already relative to project root,
              while `eslint-plugin-mdx` gives an absolute path */
            const vFilePathRel = path.relative(remarkCwd, vFile.path);

            if (minimatch(vFilePathRel, mdPathCleaned)) {
              schemaPathFromCwd = path.join(remarkCwd, globSchemaPath);
            }
          }
        });
      },
    );
  }

  /* ········································································ */

  let schema: JSONSchema7 | undefined;
  if (hasPropSchema) {
    schema = settings.embed;
  } else if (schemaPathFromCwd) {
    /* Load schema + references */
    schema = await $RefParser
      // NOTE: Ext. `$refs` are embedded, not local defs.
      // Could be useful to embed ext. refs. in definitions,
      // so we could keep the ref. name for debugging?
      .bundle(schemaPathFromCwd)
      .catch((error) => {
        if (error instanceof Error) {
          const banner = `YAML schema file load/parse: ${
            schemaPathFromCwd ?? ''
          }`;
          vFile.message(`${banner} — ${error.name}: ${error.message}`);
        }
        return undefined;
      })
      /* Asserting then using a JSONSchema4 for AJV (JSONSchema7) is OK */
      .then((refSchema) =>
        refSchema ? (refSchema as JSONSchema7) : undefined,
      );

    /* Schema is now extracted,
      remove in-file `$schema` key, so it will not interfere later */

    if (hasLocalAssoc && yamlJS && typeof yamlJS.$schema === 'string') {
      delete yamlJS.$schema;
    }
  }

  /* ········································································ */

  /* We got an extracted schema to work with */
  if (schema && yamlDoc) {
    /* Setup AJV (Another JSON-Schema Validator) */
    const ajv = new Ajv({
      /* Defaults */
      allErrors: true /* So it doesn't stop at the first found error */,
      strict: false /* Prevents warnings for valid, but relaxed schemas */,

      /* User settings / overrides */
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
          schemaPathFromCwd ?? '',
          lineCounter,
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        const banner = `JSON schema malformed: ${schemaPathFromCwd ?? ''}`;
        vFile.message(`${banner} — ${error.name}: ${error.message}`);
      }
    }
  }
}

/* ·········································································· */

const remarkFrontmatterSchema = lintRule(
  {
    url,
    origin: 'remark-lint:frontmatter-schema',
  },
  async (ast: Root, vFile: VFile, settings: Settings = {}) => {
    if (ast.children.length) {
      /* Handle only if the processed Markdown file has a frontmatter section */
      if (ast.children[0].type === 'yaml') {
        await validateFrontmatter(ast.children[0], vFile, settings);
      }
    }
  },
);

export default remarkFrontmatterSchema;

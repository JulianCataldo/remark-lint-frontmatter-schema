/* ——————————————————————————————————————————————————————————————————————————— *
 *              © Julian Cataldo — https://www.juliancataldo.com.              *
 *                      See LICENSE in the project root.                       *
/* —————————————————————————————————————————————————————————————————————————— */

/* eslint-disable max-lines */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { findUp } from 'find-up';
import minimatch from 'minimatch';
/* ·········································································· */
import yaml, { type Document, isNode, LineCounter } from 'yaml';
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
  $schema?: string;
  /* This is the typical Frontmatter object, as treated by common consumers */
  [key: string]: unknown;
}

/* ·········································································· */

/* The vFile cwd isn't the same as the one from IDE extension.
Extension will cascade upward from the current processed file and
take the remarkrc file as its cwd. It's multi-level workspace
friendly. We have to mimick this behavior here, as it doesn't seems
to offer an API to hook up on this. */
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
  const remarkCwd = await getRemarkCwd(vFile.path);

  /* Parse the YAML literal and get the YAML Abstract Syntax Tree,
     previously extracted by `remark-frontmatter` */
  try {
    yamlDoc = yaml.parseDocument(sourceYaml.value, { lineCounter });
    yamlJS = yamlDoc.toJS() as FrontmatterObject;

    /* Local `$schema` association takes precedence over global / prop. */
    if (yamlJS.$schema && typeof yamlJS.$schema === 'string') {
      hasLocalAssoc = true;
      if (yamlJS.$schema.startsWith('../') || yamlJS.$schema.startsWith('./')) {
        /* From current processed file directory  (starts with `./foo` or `../foo`) */
        schemaRelPath = path.join(path.dirname(vFile.path), yamlJS.$schema);
      } else {
        /* From workspace root (starts with `foo` or `/foo`) */
        schemaRelPath = yamlJS.$schema;
      }
    }
  } catch (error) {
    /* NOTE: Never hitting this error,
         parser seems to handle anything we throw at it */
    if (error instanceof Error) {
      const banner = `YAML frontmatter parsing: ${schemaRelPath ?? ''}`;
      vFile.message(`${banner} — ${error.name}: ${error.message}`);
    }
  }

  /* Global schemas associations, only if no local schema is set */
  if (yamlDoc && yamlJS && !hasLocalAssoc) {
    Object.entries(settings.schemas ?? {}).forEach(
      ([globSchemaPath, globSchemaAssocs]) => {
        /* Check if current markdown file is associated with this schema */
        globSchemaAssocs.forEach((mdFilePath) => {
          if (typeof mdFilePath === 'string') {
            /* Remove appended `./` or `/` */
            const mdPathCleaned = path.join(mdFilePath);
            /* With `remark`, `vFile.path` is already relative to project root,
               while `eslint-plugin-mdx` gives an absolute path */
            const vFilePathRel = path.relative(process.cwd(), vFile.path);

            if (minimatch(vFilePathRel, mdPathCleaned)) {
              schemaRelPath = globSchemaPath;
            }
          }
        });
      },
    );
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
      const fileData = await readFile(schemaFullPath, 'utf-8');
      // TODO: Validate schema with JSON meta schema
      schema = yaml.parse(fileData) as unknown as JSONSchema7;
      /* Schema is now extracted,
         remove in-file `$schema` key, so it will not interfere later */
      if (hasLocalAssoc) {
        if (yamlJS && typeof yamlJS.$schema === 'string') {
          delete yamlJS.$schema;
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        const banner = `YAML schema file load/parse: ${schemaRelPath ?? ''}`;
        vFile.message(`${banner} — ${error.name}: ${error.message}`);
      }
    }
  }

  /* We got an extracted schema to work with */
  if (schema && yamlDoc) {
    /* Setup AJV (Another JSON-Schema Validator) */
    const ajv = new Ajv({
      /* Defaults */
      allErrors: true /* So it doesn't stop at the first found error */,
      strict: false /* Prevents warnings for valid, but relaxed schemas */,

      loadSchema(uri) {
        /* Load external referenced schema relatively from schema path */
        return new Promise((resolve, reject) => {
          readFile(fileURLToPath(uri), 'utf8')
            .then((data) => {
              try {
                const parsedSchema = yaml.parse(data) as unknown;
                if (parsedSchema && typeof parsedSchema === 'object') {
                  resolve(parsedSchema);
                }
              } catch (_) {
                reject(new Error(`Could not parse ${uri}`));
              }
            })
            .catch((_) => {
              reject(new Error(`Could not locate ${uri}`));
            });
        });
      },

      /* User settings / overrides */
      ...settings.ajvOptions,
    });
    addFormats(ajv);

    /* Set current schema absolute URI, so AJV can resolve relative `$ref` */
    if (!('$id' in schema) && schemaFullPath) {
      schema.$id = pathToFileURL(schemaFullPath).toString();
    }

    /* JSON Schema compilation + validation with AJV */
    try {
      const validate = await ajv.compileAsync(schema);
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
    } catch (error) {
      if (error instanceof Error) {
        const banner = `JSON schema malformed: ${schemaRelPath ?? ''}`;
        vFile.message(`${banner} — ${error.name}: ${error.message}`);
      }
    }
  }
}

const remarkFrontmatterSchema = lintRule(
  {
    url,
    origin: 'remark-lint:frontmatter-schema',
  },
  async (ast: Root, vFile: VFile, settings: Settings = {}) => {
    /* Handle only if the current Markdown file has a frontmatter section */
    if (ast.children.length) {
      // IDEA: Is the `0` due to the fact that `remark-frontmatter`
      // could provide multi-parts frontmatter? Should investigate this
      if (ast.children[0].type === 'yaml') {
        await validateFrontmatter(ast.children[0], vFile, settings);
      }
    }
  },
);

export default remarkFrontmatterSchema;

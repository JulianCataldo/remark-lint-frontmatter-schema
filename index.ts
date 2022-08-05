import fs from "fs";
import path from "path";

import yaml from "js-yaml";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { location } from "vfile-location";
import { VFileMessage } from "vfile-message";

import { lintRule } from "unified-lint-rule";
import type { Node } from "unist";

type NodeWithChildren = Node & { children?: { value: string }[] };

const remarkFrontmatterSchema = lintRule(
  {
    origin: "remark-lint:frontmatter-schema",
    url: "https://github.com/JulianCataldo/remark-lint-frontmatter-schema",
  },
  (ast: NodeWithChildren, file) => {
    const value = String(file);

    const raw = ast?.children[0].value;
    const data: { $schema?: string; [key: string]: any } = yaml.load(raw);
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);

    const schemaPath = data.$schema;
    const schema = yaml.load(
      fs.readFileSync(path.join(process.cwd(), data.$schema), "utf-8")
    );
    delete data.$schema;

    const validate = ajv.compile(schema);

    validate(data);

    /* JSON Schema validation failed */

    validate?.errors?.forEach((error) => {
      const l = location(raw);

      const thePath = error.instancePath.substring(1).replace("/", ".");

      const msg = new VFileMessage(
        `Schema${error.instancePath ? ` ${error.instancePath}:` : ":"} ${
          error.message
        }`,
        // position,
        null,
        "Here"
      );

      msg.note = yaml
        .dump({
          type: error?.type,
          keyword: error.keyword,
          params: error.params,
          $schema: `${schemaPath}/${error.schemaPath}`,
        })
        .trim();

      msg.expected = error?.params?.allowedValues;

      file.messages.push(msg);
    });
  }
);

export default remarkFrontmatterSchema;

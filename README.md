# `remark-lint-frontmatter-schema`

<!-- [![Build Status](https://img.shields.io/github/workflow/status/JulianCataldo/remark-lint-frontmatter-schema/release/master.svg)](https://github.com/@julian_cataldo/remark-lint-frontmatter-schema/actions/workflows/release.yml?query=branch%3Amain) -->

[![NPM](https://img.shields.io/npm/v/@julian_cataldo/remark-lint-frontmatter-schema)](https://www.npmjs.com/package/@julian_cataldo/remark-lint-frontmatter-schema)
[![prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://prettier.io)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://makeapullrequest.com)
[![ISC License](https://img.shields.io/npm/l/@julian_cataldo/remark-lint-frontmatter-schema)](./LICENSE)
[![Downloads](https://img.shields.io/npm/dw/@julian_cataldo/remark-lint-frontmatter-schema)](https://www.npmjs.com/package/@julian_cataldo/remark-lint-frontmatter-schema)

Validate **Markdown** frontmatter **YAML** against an associated **JSON schema** with this **remark-lint** rule plugin.

Supports:

- **Types validation**, pattern, enumerations,… and all you can get with JSON Schema
- **Code location** problems indicator (for IDE to underline)
- **Auto-fixes** with suggestions
- **C**ommand **L**ine **I**nterface reporting
- **VS Code** integration (see below)
- **Global patterns** or **in-file** schemas associations
- In JS framework **MD / MDX pipelines**

# Demo

[![Demo screenshot of frontmatter schema linter 1](./docs/screenshot.png)](https://raw.githubusercontent.com/JulianCataldo/remark-lint-frontmatter-schema/4985660878364df7c46d61d7efc79d96e2069ab4/docs/screenshot.png)

---

[![Demo screenshot of frontmatter schema linter 2](./docs/screenshot-2.png)](https://raw.githubusercontent.com/JulianCataldo/remark-lint-frontmatter-schema/4985660878364df7c46d61d7efc79d96e2069ab4/docs/screenshot-2.png)

---

[![Demo screenshot of frontmatter schema linter 3](./docs/screenshot-3.png)](https://raw.githubusercontent.com/JulianCataldo/remark-lint-frontmatter-schema/4985660878364df7c46d61d7efc79d96e2069ab4/docs/screenshot-3.png)

## 👉  **Play with pre-configured [./demo](./demo/)**

Quick clone with:

```sh
pnpx degit JulianCataldo/remark-lint-frontmatter-schema/demo ./demo
```

---

**Jump to**:

- [`remark-lint-frontmatter-schema`](#remark-lint-frontmatter-schema)
- [Demo](#demo)
  - [👉  **Play with pre-configured ./demo**](#play-with-pre-configured-demo)
- [Quick start](#quick-start)
  - [Installation](#installation)
    - [VS Code (optional)](#vs-code-optional)
  - [Configuration](#configuration)
    - [Workspace](#workspace)
    - [Schemas associations](#schemas-associations)
      - [Schema example](#schema-example)
    - [Inside frontmatter](#inside-frontmatter)
    - [🆕  Globally, with patterns](#globally-with-patterns)
    - [CLI / IDE (VS Code) - linting](#cli--ide-vs-code---linting)
    - [MD / MDX pipeline](#md--mdx-pipeline)
      - [🆕  Custom pipeline - runtime](#custom-pipeline---runtime)
        - [Important foot-notes for custom pipeline](#important-foot-notes-for-custom-pipeline)
      - [Framework](#framework)
        - [Astro](#astro)
        - [Gatsby](#gatsby)

---

# Quick start

## Installation

```shell
pnpm install -D \
remark remark-cli \
remark-frontmatter \
@julian_cataldo/remark-lint-frontmatter-schema
```

> **Remove** `-D` flag for runtime **`unified`** MD / MDX **pipeline** (custom, Astro, Gatsby, etc.), for production.  
> **Keep it** if you just want to lint with **CLI** or your **IDE** locally, without any production / CI needs.

### VS Code (optional)

```
code --install-extension unifiedjs.vscode-remark
```

## Configuration

👉  **See [./demo](./demo/)** folder to get a working, pre-configured, bare project workspace.  
You also get example markdown files and associated schema to play with.  
Supports `remark-cli` and/or `unifiedjs.vscode-remark` extension.

📌  Check out the **[demo/README.md](./demo) for bootstrapping** it.

### Workspace

Create root config file for `remark` to source from:  
`touch ./.remarkrc.mjs`

Paste this base config:

```mjs
import remarkFrontmatter from 'remark-frontmatter';
import rlFmSchema from '@julian_cataldo/remark-lint-frontmatter-schema';

const remarkConfig = {
  plugins: [remarkFrontmatter, rlFmSchema],
};
export default remarkConfig;
```

### Schemas associations

Inspired by [VS Code JSON Schema](https://code.visualstudio.com/docs/languages/json#_json-schemas-and-settings)
and [`redhat.vscode-yaml`](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml) conventions.

#### Schema example

`creative-work.schema.yaml`

```yaml
type: object
properties:
  title:
    type: string
# …
```

### Inside frontmatter

See **[./demo/content](./demo/content)** files for examples.

Schema association can be done directly **inside** the **frontmatter** of the **markdown** file,
relative to project root, thanks to the `'$schema'` key:

```markdown
---
'$schema': /content/creative-work.schema.yaml

title: Hello there
category: Book
# …
---

# You're welcome!

🌝  My **markdown** content…  🌚
…
```

### 🆕  Globally, with patterns

> **Note**:  
> Locally defined **`'$schema'` takes precedence** over global settings below.

```js
const remarkConfig = {
  plugins: [
    remarkFrontmatter,
    [
      rlFmSchema,
      {
        schemas: {
          /* One schema for many files */
          './content/creative-work.schema.yaml': [
            /* Support glob patterns */
            './content/*-creative-work.md',
            /* Or direct file association */
            './content/the-one.md',
          ],
          './content/ghost.schema.yaml': [
            './content/casper.md',
            './content/ether.md',
          ],
        },
      },
    ],
  ],
};
```

`'./foo'`, `'/foo'`, `'foo'`, all will work.  
It's always relative to your `./.remarkrc.mjs` file, in your workspace root.

### CLI / IDE (VS Code) - linting

Linting whole workspace files (as `./**/*.md`) with `remark-cli`:

```shell
pnpm remark .
```

Yields:

```shell
# …
content/correct-creative-work.md
  1:1  warning  /category: Must be equal to one of the allowed values  frontmatter-schema  remark-lint
  1:1  warning  /complex/some: Must be string                          frontmatter-schema  remark-lint

⚠ 6 warnings
```

### MD / MDX pipeline

Use it as usual like any remark plugin inside your framework or your custom `unified` pipeline.

#### 🆕  Custom pipeline - runtime

When processing markdown as single files inside your JS/TS app.

Schema should be provided programmatically like this:

```ts
// …
import remarkFrontmatter from 'remark-frontmatter';
import rlFmSchema from '@julian_cataldo/remark-lint-frontmatter-schema';
import type { JSONSchema7 } from 'json-schema';
import { reporter } from 'vfile-reporter';

const mySchema: JSONSchema7 = {
  /* … */
};

const output = await unified()
  // Your pipeline (basic example)
  .use(remarkParse)
  // …
  .use(remarkFrontmatter)

  .use(rlFmSchema, {
    /* Bring your own schema */
    embed: mySchema,
  })

  // …
  .use(remarkRehype)
  .use(rehypeStringify)
  .use(rehypeFormat)
  .process(theRawMarkdownLiteral);

/* `path` is for debugging purpose here, as MD literal comes from your app. */
output.path = './the-current-processed-md-file.md';

console.error(reporter([output]));
```

Yields:

```
./the-current-processed-md-file.md
  1:1  warning  Must have required property 'tag'  frontmatter-schema  remark-lint

⚠ 1 warning
```

##### Important foot-notes for custom pipeline

This is **different from static linting**, with VS Code extension or CLI.  
It **will not source `.remarkrc`** (still, you can source it by your means if you want).  
In fact, it's not aware of your file structure,
nor it will associated or import any schema / markdown files.  
That way, it will integrate easier with your own business logic, even if that means more work.  
I found that **static linting** (during editing) / and **runtime validation** are two different
uses cases enough to separate them in their setups, but I might converge them partially.

#### Framework

> **Warning**  
> WIP. **NOT tested yet**!

##### Astro

In `astro.config.mjs`

```ts
// …
export default defineConfig({
  // …
  remarkPlugins: [
    // …
    'remark-frontmatter',
    '@julian_cataldo/remark-lint-frontmatter-schema',
    // …
  ];
  // …
});
```

##### Gatsby

In `gatsby-config.js`

```ts
{
  // …
  plugins: [
    // …
    {
      resolve: 'gatsby-transformer-remark',
      options: {
        plugins: [
          // …
          'remark-frontmatter',
          '@julian_cataldo/remark-lint-frontmatter-schema',
          // …
        ],
      },
    },
    // …
  ];
}
```

<!-- OBSOLETE -->
<!-- # Known limitations

Actually, you will not have **code range detection** for schemas errors.
Finding a way of doing this would easily allow hot-fix replacement for `enum` suggestions, for example.
The great folks who made [yaml-language-server](https://github.com/redhat-developer/yaml-language-server)
have tackled this, and much more.
In fact, this remark plugin is **very far** from `yaml-language-server` capabilities, which are astonishing.
Still, this `remark` plugin is, I think, the only way to validate YAML
frontmatter inside Markdown.
My current knowledge is that YAML in Markdown, by not being part of any official specs, is hindering development in this direction.
So it's better than nothing I guess, and could be a first step for something more robust. -->

---

Using:

- **CLI Tool**
  > Remark lint | https://github.com/remarkjs/remark-lint
- **IDE Extension** (optional)
  > VS Code `unifiedjs.vscode-remark`  
  > https://github.com/remarkjs/vscode-remark

Major dependencies:

`ajv`, `yaml`, `remark`, `remark-frontmatter`, `unified`, `remark-cli`

---

See [CHANGELOG.md](./CHANGELOG.md) for release history.

---

🔗  [JulianCataldo.com](https://www.juliancataldo.com)

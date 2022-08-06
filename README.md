# remark-lint-frontmatter-schema

Validate your Markdown frontmatter data against a JSON schema with this **remark-lint** rule plugin.

> **Warning**  
> Work in progress

---

- [remark-lint-frontmatter-schema](#remark-lint-frontmatter-schema)
- [Demo](#demo)
- [Usage](#usage)
  - [Installation](#installation)
  - [Setting up](#setting-up)
    - [CLI / IDE](#cli--ide)
    - [MD / MDX pipeline](#md--mdx-pipeline)
      - [Custom](#custom)
      - [Framework](#framework)
        - [Astro](#astro)
        - [Gatsby](#gatsby)
- [Known limitations](#known-limitations)

---

# Demo

[![Demo screenshot of frontmatter schema linter](./docs/screenshot.png)](./docs/screenshot.png)

# Usage

```shell
pnpm i -D @julian_cataldo/remark-lint-frontmatter-schema
```

## Installation

> **Remove** `-D` flag if you're using this plugin within a runtime **`unified`** MD / MDX **pipeline** (Custom, Astro, Gatsby, etc.), for production.  
> **Keep it** if you just want to lint with **CLI** or your **IDE** locally, without any production / CI needs.

## Setting up

### CLI / IDE

See [./demo](./demo/) folder to get a working, pre-configured, bare project workspace.  
You also get example markdown files and associated schema to play with.

📌  Checkout the **[demo/README.md](demo/README.md) for step-by-step instructions**.

### MD / MDX pipeline

Use it as usual like any remark plugin inside your framework or your custom `unified` pipeline.

#### Custom

```ts
// ...
import remarkFrontmatter from 'remark-frontmatter';
import rlFmSchema from '@julian_cataldo/remark-lint-frontmatter-schema';

// ...
unified()
  //...
  .use(remarkFrontmatter)
  .use(rlFmSchema);
// ...
```

#### Framework

> **Warning**  
> Untested!

##### Astro

In `astro.config.mjs`

```ts
// ...
export default defineConfig({
  // ...
  remarkPlugins: [
    // ...
    'remark-frontmatter',
    '@julian_cataldo/remark-lint-frontmatter-schema',
    // ...
  ];
  // ...
});
```

##### Gatsby

In `gatsby-config.js`

```ts
{
  // ...
  plugins: [
    // ...
    {
      resolve: 'gatsby-transformer-remark',
      options: {
        plugins: [
          // ...
          'remark-frontmatter',
          '@julian_cataldo/remark-lint-frontmatter-schema',
          // ...
        ],
      },
    },
    // ...
  ];
}
```

# Known limitations

Actually, you will not have code range detection for schemas errors.  
Finding a way of doing this would allow hot-fix replacement for `enum` suggestions, for example.  
The great folks who made [yaml-language-server](https://github.com/redhat-developer/yaml-language-server)
have tackled this.

---

Using:

- **CLI Tool**
  > Remark lint | https://github.com/remarkjs/remark-lint
- **IDE Extension** (optional)
  > VS Code `unifiedjs.vscode-remark`  
  > https://github.com/remarkjs/vscode-remark

---

🔗  [JulianCataldo.com](https//www.juliancataldo.com)

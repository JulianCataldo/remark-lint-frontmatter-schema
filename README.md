# remark-lint-frontmatter-schema

Validate your Markdown frontmatter data against a JSON schema with this **remark-lint** rule plugin.

> **Warning**  
> Work in progress

# Demo

[![Demo screenshot of frontmatter schema linter](./docs/screenshot.png)](./docs/screenshot.png)

# Usage

See [./demo](./demo/) folder to get a working, pre-configured, bare project workspace.  
You also get example markdown files and associated schema to play with.

Checkout the **[demo/README.md](demo/README.md) for step-by-step instructions**.

# Known limitations

Actually, you will not have code range detection for detected problems.  
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

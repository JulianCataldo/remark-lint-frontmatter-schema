# Demo

## Install VS Code Remark extension (optional)

```sh
code --install-extension unifiedjs.vscode-remark
```

## Bootstrap current demo project

```sh
pnpm i
```

## Open content

Let's open [./content](./content/) **markdowns** and **schemas** with VS Code:

```sh
(cd ./content && code -r \
creative-work.schema.yaml \
correct-creative-work.md \
broken-creative-work.md)
```

## Review problems

### Continuous linting with VS Code

Toggle 'Problems' pane view (`⌘ + ⇧ + M` on mac)

### One-shot, full project linting with Command Line Interface

```
pnpm remark .
```

## Edit content

Play with schema and markdown frontmatter and see what happens in VS Code problem list!

---

🔗  [JulianCataldo.com](https//www.juliancataldo.com)

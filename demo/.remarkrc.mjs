import remarkFrontmatter from 'remark-frontmatter';
import remarkLintFrontmatterSchema from 'remark-lint-frontmatter-schema';
/* —————————————————————————————————————————————————————————————————————————— */

const remarkConfig = {
  plugins: [
    remarkFrontmatter,
    /* v————— Use it without settings, with local '$schema' associations only */
    // rlFmSchema

    /* v————— Or with global schemas associations */
    [
      remarkLintFrontmatterSchema,
      {
        schemas: {
          /* One schema for many files */
          './content/creative-work.schema.yaml': [
            './content/creative-work/the-shipwreck__global-broken.md',

            /* Support glob patterns ———v */
            // './content/creative-work/*.md',
            // …
            // `./` prefix is optional
            // 'content/creative-work/foobiz.md',
            // './content/elsewhere/does-not-exist-anymore.md',
          ],

          // './content/ghost.schema.yaml': [
          //   './content/casper.md',
          //   './content/ether.md',
          // ],
        },
      },
    ],
  ],
};

export default remarkConfig;

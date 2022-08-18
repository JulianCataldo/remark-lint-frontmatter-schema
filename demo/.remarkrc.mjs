import remarkFrontmatter from 'remark-frontmatter';
import rlFmSchema from '@julian_cataldo/remark-lint-frontmatter-schema';
/* —————————————————————————————————————————————————————————————————————————— */

const remarkConfig = {
  plugins: [
    remarkFrontmatter,
    /* v————— Use it without settings, with local '$schema' associations only */
    // rlFmSchema

    /* v————— Or with global schemas associations */
    [
      rlFmSchema,
      {
        schemas: {
          /* One schema for many files */
          './content/creative-work.schema.yaml': [
            /* Support glob patterns */
            './content/*-creative-work.md',
            // './content/does-not-exist-anymore.md',
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

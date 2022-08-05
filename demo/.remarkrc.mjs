import remarkFrontmatter from "remark-frontmatter";
import rlFmSchema from "@julian_cataldo/remark-lint-frontmatter-schema";
/* —————————————————————————————————————————————————————————————————————————— */

const remarkConfig = {
  plugins: [remarkFrontmatter, rlFmSchema],
};

export default remarkConfig;

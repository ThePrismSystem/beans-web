import { cleanupGitRoot } from "./seed.mjs";

export default function globalTeardown() {
  cleanupGitRoot();
}

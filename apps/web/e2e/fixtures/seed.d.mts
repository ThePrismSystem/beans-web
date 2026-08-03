export interface SeedState {
  root: string;
  projectDir: string;
  projectName: string;
  taskTitle: string;
  featureTitle: string;
  emptyProjectName: string;
  emptyProjectDir: string;
}

export function seedGitRoot(): SeedState;
export function readSeedState(): SeedState;
export function cleanupGitRoot(): void;

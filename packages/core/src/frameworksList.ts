import { frameworkCatalog } from "./frameworkCatalog";
import type { FrameworkInfo } from "./util/frameworkTypes";

export const frameworkInfo: FrameworkInfo[] = await Promise.all(
  frameworkCatalog.map(async ({ load, testPullCounts }) => ({
    framework: await load(),
    testPullCounts,
  })),
);
export const allFrameworks = frameworkInfo;

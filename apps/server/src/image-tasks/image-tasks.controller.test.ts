import { GUARDS_METADATA } from "@nestjs/common/constants";
import { ImageTasksController } from "./image-tasks.controller";

describe("ImageTasksController JWT guard", () => {
  it("requires the existing JWT guard before image-task read or review endpoints can execute", () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ImageTasksController);

    expect(Array.isArray(guards)).toBe(true);
    expect(guards).toHaveLength(1);
  });
});

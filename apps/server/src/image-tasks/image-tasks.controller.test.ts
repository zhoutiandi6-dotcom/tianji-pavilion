import { GUARDS_METADATA } from "@nestjs/common/constants";
import { ImageTasksController } from "./image-tasks.controller";

describe("ImageTasksController detail query guard", () => {
  it("requires the existing JWT guard before GET /image-tasks/:id can execute", () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ImageTasksController);

    expect(Array.isArray(guards)).toBe(true);
    expect(guards).toHaveLength(1);
  });
});

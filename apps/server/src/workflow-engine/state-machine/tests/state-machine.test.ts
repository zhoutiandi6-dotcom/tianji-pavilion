import { StateMachine } from "../index";

describe("StateMachine", () => {
  describe("canTransition - Task status", () => {
    it("DRAFT can submit", () => {
      expect(StateMachine.canTransition("DRAFT", "SUBMITTED", "task")).toBe(true);
    });

    it("DRAFT cannot skip to OPS_APPROVED directly", () => {
      expect(StateMachine.canTransition("DRAFT", "OPS_APPROVED", "task")).toBe(false);
    });

    it("SUBMITTED can withdraw, approve, or reject", () => {
      expect(StateMachine.canTransition("SUBMITTED", "DRAFT", "task")).toBe(true);
      expect(StateMachine.canTransition("SUBMITTED", "OPS_APPROVED", "task")).toBe(true);
      expect(StateMachine.canTransition("SUBMITTED", "OPS_REJECTED", "task")).toBe(true);
    });

    it("OPS_REJECTED can be resubmitted", () => {
      expect(StateMachine.canTransition("OPS_REJECTED", "SUBMITTED", "task")).toBe(true);
    });

    it("COMPLETED is final", () => {
      expect(StateMachine.canTransition("COMPLETED", "IN_DESIGN", "task")).toBe(false);
    });

    it("unknown current state returns false", () => {
      expect(StateMachine.canTransition("UNKNOWN", "DRAFT", "task")).toBe(false);
    });
  });

  describe("canTransition - ImageTask status", () => {
    it("WAITING_OPS_APPROVAL can become PENDING_ASSIGNMENT", () => {
      expect(StateMachine.canTransition("WAITING_OPS_APPROVAL", "PENDING_ASSIGNMENT", "image_task")).toBe(true);
    });

    it("PENDING_ASSIGNMENT can become NOT_STARTED", () => {
      expect(StateMachine.canTransition("PENDING_ASSIGNMENT", "NOT_STARTED", "image_task")).toBe(true);
    });

    it("NOT_STARTED can start", () => {
      expect(StateMachine.canTransition("NOT_STARTED", "IN_PROGRESS", "image_task")).toBe(true);
    });

    it("IN_PROGRESS can submit for review", () => {
      expect(StateMachine.canTransition("IN_PROGRESS", "SUBMITTED_FOR_REVIEW", "image_task")).toBe(true);
    });

    it("SUBMITTED_FOR_REVIEW can be approved or rejected", () => {
      expect(StateMachine.canTransition("SUBMITTED_FOR_REVIEW", "APPROVED", "image_task")).toBe(true);
      expect(StateMachine.canTransition("SUBMITTED_FOR_REVIEW", "REVISION_REQUIRED", "image_task")).toBe(true);
    });

    it("COMPLETED is final for image tasks", () => {
      expect(StateMachine.canTransition("COMPLETED", "IN_PROGRESS", "image_task")).toBe(false);
      expect(StateMachine.canTransition("COMPLETED", "SUBMITTED_FOR_REVIEW", "image_task")).toBe(false);
    });
  });

  describe("calcTaskWorkflowStatus", () => {
    it("all image tasks completed or approved = COMPLETED", () => {
      expect(StateMachine.calcTaskWorkflowStatus(["COMPLETED", "APPROVED"])).toBe("COMPLETED");
    });

    it("any active design status = IN_DESIGN", () => {
      expect(StateMachine.calcTaskWorkflowStatus(["COMPLETED", "SUBMITTED_FOR_REVIEW"])).toBe("IN_DESIGN");
      expect(StateMachine.calcTaskWorkflowStatus(["COMPLETED", "IN_PROGRESS"])).toBe("IN_DESIGN");
      expect(StateMachine.calcTaskWorkflowStatus(["COMPLETED", "REVISION_REQUIRED"])).toBe("IN_DESIGN");
    });

    it("any not started status = DESIGN_ASSIGNED", () => {
      expect(StateMachine.calcTaskWorkflowStatus(["NOT_STARTED", "NOT_STARTED"])).toBe("DESIGN_ASSIGNED");
    });

    it("empty array = OPS_APPROVED", () => {
      expect(StateMachine.calcTaskWorkflowStatus([])).toBe("OPS_APPROVED");
    });
  });

  describe("isValidStatus", () => {
    it("valid task statuses return true", () => {
      expect(StateMachine.isValidStatus("DRAFT", "task")).toBe(true);
      expect(StateMachine.isValidStatus("SUBMITTED", "task")).toBe(true);
      expect(StateMachine.isValidStatus("OPS_APPROVED", "task")).toBe(true);
      expect(StateMachine.isValidStatus("IN_DESIGN", "task")).toBe(true);
      expect(StateMachine.isValidStatus("DESIGN_REVIEW", "task")).toBe(true);
      expect(StateMachine.isValidStatus("COMPLETED", "task")).toBe(true);
      expect(StateMachine.isValidStatus("CANCELLED", "task")).toBe(true);
    });

    it("image task status on task entity returns false", () => {
      expect(StateMachine.isValidStatus("NOT_STARTED", "task")).toBe(false);
    });

    it("valid image task statuses return true", () => {
      expect(StateMachine.isValidStatus("WAITING_OPS_APPROVAL", "image_task")).toBe(true);
      expect(StateMachine.isValidStatus("PENDING_ASSIGNMENT", "image_task")).toBe(true);
      expect(StateMachine.isValidStatus("NOT_STARTED", "image_task")).toBe(true);
      expect(StateMachine.isValidStatus("IN_PROGRESS", "image_task")).toBe(true);
      expect(StateMachine.isValidStatus("SUBMITTED_FOR_REVIEW", "image_task")).toBe(true);
      expect(StateMachine.isValidStatus("COMPLETED", "image_task")).toBe(true);
    });
  });

  describe("getAllowedTransitions", () => {
    it("DRAFT allows only SUBMITTED", () => {
      expect(StateMachine.getAllowedTransitions("DRAFT", "task")).toEqual(["SUBMITTED"]);
    });

    it("COMPLETED has no allowed transitions", () => {
      expect(StateMachine.getAllowedTransitions("COMPLETED", "task")).toEqual([]);
    });
  });
});

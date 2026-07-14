import { Injectable } from "@nestjs/common";
import { calcTaskStatus } from "./enums";

@Injectable()
export class StatusCalculatorService {
  // ImageTask status enum constants
  static readonly NOT_STARTED = "NOT_STARTED";
  static readonly PENDING_ASSIGNMENT = "PENDING_ASSIGNMENT";
  static readonly IN_PROGRESS = "IN_PROGRESS";
  static readonly SUBMITTED_FOR_REVIEW = "SUBMITTED_FOR_REVIEW";
  static readonly COMPLETED = "COMPLETED";

  // Priority: NOT_STARTED < IN_PROGRESS < SUBMITTED_FOR_REVIEW < COMPLETED

  calcTaskStatus(imageTasks: { status: string }[]): string {
    return calcTaskStatus(imageTasks);
  }

  canDesignerModify(designerId: number | null, userId: number): boolean {
    return designerId === userId;
  }
}

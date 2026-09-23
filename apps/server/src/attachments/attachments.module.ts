import { Module } from "@nestjs/common";
import { AttachmentsService } from "./attachments.service";
import { AttachmentsController } from "./attachments.controller";
import { TaskVisibilityService } from "../common/task-visibility.service";
@Module({ controllers: [AttachmentsController], providers: [AttachmentsService, TaskVisibilityService], exports: [AttachmentsService] })
export class AttachmentsModule {}

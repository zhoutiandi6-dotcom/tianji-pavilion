import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { AttachmentsService } from "./attachments.service";

@UseGuards(AuthGuard("jwt"))
@Controller("attachments")
export class AttachmentsController {
  constructor(private service: AttachmentsService) {}

  @Get(":attachmentId/annotations")
  @Header("Cache-Control", "no-store")
  getAnnotations(@Param("attachmentId", ParseIntPipe) id: number, @Request() req: any) {
    return this.service.getAnnotations(id, req.user.sub, req.user.role);
  }

  @Put(":attachmentId/annotations")
  @Header("Cache-Control", "no-store")
  saveAnnotations(@Param("attachmentId", ParseIntPipe) id: number, @Body() body: unknown, @Request() req: any) {
    return this.service.saveAnnotations(id, body, req.user.sub, req.user.role);
  }

  @Get("by-task/:taskId")
  async findByTask(@Param("taskId", ParseIntPipe) taskId: number, @Request() req: any) {
    return this.service.findByTask(taskId, req.user.sub, req.user.role);
  }

  @Get("by-image-task/:imageTaskId")
  async findByImageTask(@Param("imageTaskId", ParseIntPipe) imageTaskId: number, @Request() req: any) {
    return this.service.findByImageTask(imageTaskId, req.user.sub, req.user.role);
  }

  @Get("by-feedback/:feedbackId")
  async findByFeedback(@Param("feedbackId", ParseIntPipe) feedbackId: number, @Request() req: any) {
    return this.service.findByFeedback(feedbackId, req.user.sub, req.user.role);
  }

  @Post("task/:taskId/upload")
  @UseInterceptors(FileInterceptor("file"))
  async uploadTask(
    @Param("taskId", ParseIntPipe) taskId: number,
    @Body("category") category: string,
    @UploadedFile() file: any,
    @Request() req: any,
  ) {
    return this.service.uploadTaskAttachment(taskId, category, file, req.user.sub, req.user.role, req);
  }

  @Post("image-task/:imageTaskId/upload")
  @UseInterceptors(FileInterceptor("file"))
  async uploadImageTask(
    @Param("imageTaskId", ParseIntPipe) imageTaskId: number,
    @Body("category") category: string,
    @UploadedFile() file: any,
    @Request() req: any,
  ) {
    return this.service.uploadImageTaskAttachment(imageTaskId, category, file, req.user.sub, req.user.role, req);
  }

  @Post("feedback/:feedbackId/upload")
  @UseInterceptors(FileInterceptor("file"))
  async uploadFeedback(
    @Param("feedbackId", ParseIntPipe) feedbackId: number,
    @UploadedFile() file: any,
    @Request() req: any,
  ) {
    return this.service.uploadFeedbackAttachment(feedbackId, file, req.user.sub, req.user.role, req);
  }

  @Get(":id/download")
  async download(@Param("id", ParseIntPipe) id: number, @Request() req: any, @Res() res: Response) {
    const { attachment, filePath } = await this.service.getDownload(id, req.user.sub, req.user.role);
    return res.download(filePath, attachment.fileName);
  }

  @Delete(":id")
  async remove(@Param("id", ParseIntPipe) id: number, @Request() req: any) {
    return this.service.remove(id, req.user.sub, req.user.role);
  }
}

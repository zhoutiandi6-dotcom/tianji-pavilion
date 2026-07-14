import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import { getShanghaiWeekRange } from "../src/common/shanghai-time";

const prisma = new PrismaClient();
const outputPath = resolve(process.cwd(), "../../docs/dashboard-stage-b-initialization-analysis.md");

type Finding = { category: string; imageTaskId: number; taskId: number; reason: string; designerId?: number | null; status: string };

async function main() {
  const range = getShanghaiWeekRange();
  const imageTasks = await prisma.imageTask.findMany({
    where: { deletedAt: null, task: { deletedAt: null } },
    select: { id: true, taskId: true, imageTitle: true, designerId: true, status: true, task: { select: { serialNumber: true } } },
    orderBy: { id: "asc" },
  });
  const findings: Finding[] = [];
  for (const item of imageTasks) {
    if (["APPROVED", "COMPLETED"].includes(item.status)) {
      findings.push({ category: "已完成任务", imageTaskId: item.id, taskId: item.taskId, status: item.status, designerId: item.designerId, reason: "最终审核已通过或已完成，不应初始化为当前周计划" });
    } else if (!item.designerId) {
      findings.push({ category: "缺少设计师", imageTaskId: item.id, taskId: item.taskId, status: item.status, reason: "尚未分配设计师，不能进入周计划" });
    } else if (["NOT_STARTED", "IN_PROGRESS", "REVISION_REQUIRED", "SUBMITTED_FOR_REVIEW"].includes(item.status)) {
      findings.push({ category: "可以加入当前周", imageTaskId: item.id, taskId: item.taskId, status: item.status, designerId: item.designerId, reason: "未完成、已分配设计师；仍需设计主管明确确认计划来源" });
    } else {
      findings.push({ category: "状态冲突或无法判断", imageTaskId: item.id, taskId: item.taskId, status: item.status, designerId: item.designerId, reason: "当前状态不属于可安全初始化的设计执行状态" });
    }
  }

  const categories = ["可以加入当前周", "缺少设计师", "已完成任务", "状态冲突或无法判断"];
  const lines = [
    "# 天机阁驾驶舱阶段 B 当前周计划初始化分析",
    "",
    `生成时间：${new Date().toISOString()}`,
    `当前上海周范围：${range.start.toISOString()}（周一 00:00）至 ${range.end.toISOString()}（下周一 00:00），左闭右开。`,
    "",
    "> 本报告只读分析现有图片任务。本轮未创建 WeeklyPlan、未创建 WeeklyPlanItem、未修改 ImageTask 或 AuditEvent。",
    "",
    "## 汇总",
    "",
    ...categories.map((category) => `- ${category}：${findings.filter((item) => item.category === category).length}`),
  ];
  for (const category of categories) {
    lines.push("", `## ${category}`, "");
    const items = findings.filter((item) => item.category === category);
    if (!items.length) lines.push("- 无");
    for (const item of items) {
      lines.push(`- ImageTask#${item.imageTaskId} / Task#${item.taskId}：状态=${item.status}，设计师=${item.designerId ?? "无"}。${item.reason}`);
    }
  }
  lines.push("", "## 执行结论", "", "- 不自动初始化历史或当前任务。", "- 设计主管应先创建当前周 DRAFT 计划，再明确选择加入任务和来源。", "- 任何结转必须通过关闭上一周计划后的预览与确认接口执行。");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ outputPath, total: findings.length, weekStart: range.start.toISOString(), weekEnd: range.end.toISOString() }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());

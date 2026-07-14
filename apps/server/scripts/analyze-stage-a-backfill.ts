import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Classification = "RELIABLE" | "CONFLICT" | "UNAVAILABLE";

interface Finding {
  category: Classification;
  target: string;
  reason: string;
  proposal?: string;
}

const prisma = new PrismaClient();

function parseMetadata(value: string | null): Record<string, any> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function positiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function addFinding(findings: Finding[], finding: Finding) {
  findings.push(finding);
}

async function analyzeImageTaskAudit(findings: Finding[]) {
  const imageTasks = await prisma.imageTask.findMany({
    select: {
      id: true,
      designerId: true,
      assignedAt: true,
      assignedById: true,
      status: true,
      approvedAt: true,
      approvedById: true,
    },
  });
  const events = await prisma.auditEvent.findMany({
    where: { resourceType: "image_task" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const eventsByTask = new Map<number, typeof events>();
  for (const event of events) {
    const list = eventsByTask.get(event.resourceId) ?? [];
    list.push(event);
    eventsByTask.set(event.resourceId, list);
  }

  for (const imageTask of imageTasks) {
    const taskEvents = eventsByTask.get(imageTask.id) ?? [];
    if (imageTask.designerId && !imageTask.assignedAt && !imageTask.assignedById) {
      const candidates = taskEvents
        .filter((event) => ["assign_designer", "reassign_designer"].includes(event.action))
        .map((event) => {
          const metadata = parseMetadata(event.metadata);
          return {
            event,
            operatorId: positiveNumber(event.operatorId ?? metadata.assignedById),
            newDesignerId: positiveNumber(metadata.newDesignerId ?? metadata.designerId ?? metadata.afterValue?.designerId),
          };
        });
      const complete = candidates.filter((candidate) => candidate.operatorId && candidate.newDesignerId);
      if (!candidates.length || !complete.length) {
        addFinding(findings, {
          category: "UNAVAILABLE",
          target: `ImageTask#${imageTask.id} assignment`,
          reason: "No assignment event contains an unambiguous operator, designer and timestamp.",
        });
      } else {
        const latest = complete[complete.length - 1]!;
        const sameTimeConflicts = complete.filter((candidate) =>
          candidate.event.createdAt.getTime() === latest.event.createdAt.getTime()
          && (candidate.operatorId !== latest.operatorId || candidate.newDesignerId !== latest.newDesignerId));
        if (sameTimeConflicts.length || latest.newDesignerId !== imageTask.designerId) {
          addFinding(findings, {
            category: "CONFLICT",
            target: `ImageTask#${imageTask.id} assignment`,
            reason: "Latest assignment evidence conflicts with another event or the current designer.",
          });
        } else {
          addFinding(findings, {
            category: "RELIABLE",
            target: `ImageTask#${imageTask.id} assignment`,
            reason: "Latest complete assignment event matches the current designer.",
            proposal: `assignedAt=${latest.event.createdAt.toISOString()}, assignedById=${latest.operatorId}`,
          });
        }
      }
    }

    if (imageTask.status === "APPROVED" && !imageTask.approvedAt && !imageTask.approvedById) {
      const reviewEvents = taskEvents.filter((event) => [
        "design_review_approve", "review_approve", "design_review_reject", "review_reject",
      ].includes(event.action));
      if (!reviewEvents.length) {
        addFinding(findings, {
          category: "UNAVAILABLE",
          target: `ImageTask#${imageTask.id} approval`,
          reason: "No final design review event exists.",
        });
      } else {
        const latest = reviewEvents[reviewEvents.length - 1]!;
        const approverId = positiveNumber(latest.operatorId ?? parseMetadata(latest.metadata).reviewerId);
        const isApproval = ["design_review_approve", "review_approve"].includes(latest.action);
        if (!isApproval || !approverId) {
          addFinding(findings, {
            category: "CONFLICT",
            target: `ImageTask#${imageTask.id} approval`,
            reason: "Latest review event is not an unambiguous approval with an operator.",
          });
        } else {
          addFinding(findings, {
            category: "RELIABLE",
            target: `ImageTask#${imageTask.id} approval`,
            reason: "Latest review event is an approval with a known operator and timestamp.",
            proposal: `approvedAt=${latest.createdAt.toISOString()}, approvedById=${approverId}`,
          });
        }
      }
    }
  }
}

async function analyzeSubmissionHistory(findings: Finding[]) {
  const tasks = await prisma.task.findMany({
    select: {
      id: true,
      creatorId: true,
      submittedAt: true,
      approvalRecords: {
        where: { action: { in: ["OPS_APPROVED", "OPS_REJECTED"] } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, approverId: true, action: true, createdAt: true },
      },
    },
  });

  for (const task of tasks) {
    if (!task.approvalRecords.length) continue;
    if (task.approvalRecords.length > 1) {
      addFinding(findings, {
        category: "CONFLICT",
        target: `Task#${task.id} submission`,
        reason: "Multiple approval records exist, but historical submission boundaries are unavailable.",
      });
      continue;
    }
    const approval = task.approvalRecords[0]!;
    if (!task.submittedAt || !task.creatorId || !approval.approverId || task.submittedAt > approval.createdAt) {
      addFinding(findings, {
        category: "UNAVAILABLE",
        target: `Task#${task.id} submission`,
        reason: "Submitter, submission time and approval evidence do not form a complete ordered chain.",
      });
      continue;
    }
    addFinding(findings, {
      category: "RELIABLE",
      target: `Task#${task.id} submission`,
      reason: "A single ordered submission and approval chain is present.",
      proposal: `sequence=1, type=INITIAL, result=${approval.action === "OPS_APPROVED" ? "APPROVED" : "REJECTED"}, approvalRecordId=${approval.id}`,
    });
  }
}

function renderReport(findings: Finding[]) {
  const sections: Array<[Classification, string]> = [
    ["RELIABLE", "1. 可以可靠回填"],
    ["CONFLICT", "2. 存在冲突"],
    ["UNAVAILABLE", "3. 无法回填"],
  ];
  const lines = [
    "# 天机阁驾驶舱阶段 A 历史回填分析",
    "",
    `生成时间：${new Date().toISOString()}`,
    "",
    "> 本报告由只读分析脚本生成。本轮未执行任何历史回填，也未修改 AuditEvent。",
    "",
    "## 判定原则",
    "",
    "只有实体 ID、操作者、动作和时间都明确，且不存在冲突事件时，才归入可可靠回填。其余数据保持 null。",
    "",
    "## 汇总",
    "",
    `- 可以可靠回填：${findings.filter((item) => item.category === "RELIABLE").length}`,
    `- 存在冲突：${findings.filter((item) => item.category === "CONFLICT").length}`,
    `- 无法回填：${findings.filter((item) => item.category === "UNAVAILABLE").length}`,
    "",
  ];
  for (const [category, title] of sections) {
    lines.push(`## ${title}`, "");
    const entries = findings.filter((item) => item.category === category);
    if (!entries.length) {
      lines.push("无。", "");
      continue;
    }
    for (const item of entries) {
      lines.push(`- **${item.target}**：${item.reason}${item.proposal ? ` 建议值：\`${item.proposal}\`` : ""}`);
    }
    lines.push("");
  }
  lines.push(
    "## 执行结论",
    "",
    "- 本轮只生成分析报告，不执行 UPDATE、INSERT 或 DELETE。",
    "- 可回填项仍需在数据库副本中生成明确变更清单并经产品确认后才能执行。",
    "- 冲突和无法回填项继续保持 null，不使用当前状态反推历史。",
    "",
  );
  return lines.join("\n");
}

async function main() {
  const findings: Finding[] = [];
  await analyzeImageTaskAudit(findings);
  await analyzeSubmissionHistory(findings);
  const outputArg = process.argv.find((argument) => argument.startsWith("--output="));
  const outputPath = outputArg
    ? resolve(outputArg.slice("--output=".length))
    : resolve(__dirname, "../../../docs/dashboard-stage-a-backfill-analysis.md");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderReport(findings), "utf8");
  console.log(JSON.stringify({ outputPath, total: findings.length }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

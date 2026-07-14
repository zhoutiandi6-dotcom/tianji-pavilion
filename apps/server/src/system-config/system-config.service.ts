import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class SystemConfigService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const configs = await this.prisma.systemConfig.findMany({ orderBy: { key: "asc" } });
    const result: Record<string, string> = {};
    for (const c of configs) {
      result[c.key] = c.value;
    }
    return result;
  }

  async get(key: string): Promise<string | null> {
    const config = await this.prisma.systemConfig.findUnique({ where: { key } });
    return config?.value ?? null;
  }

  async set(key: string, value: string, updatedBy?: number, changeReason?: string) {
    const existing = await this.prisma.systemConfig.findUnique({ where: { key } });
    if (existing) {
      return this.prisma.systemConfig.update({
        where: { key },
        data: {
          value,
          version: existing.version + 1,
          updatedBy,
          changeReason: changeReason || null,
        },
      });
    }
    return this.prisma.systemConfig.create({
      data: { key, value, updatedBy, changeReason: changeReason || null },
    });
  }

  async updateBatch(updates: Record<string, string>, operatorId: number, changeReason?: string) {
    await this.prisma.$transaction(async (tx: any) => {
      for (const [key, value] of Object.entries(updates)) {
        const existing = await tx.systemConfig.findUnique({ where: { key } });
        if (existing) {
          await tx.systemConfig.update({
            where: { key },
            data: { value, version: existing.version + 1, updatedBy: operatorId, changeReason: changeReason || null },
          });
        } else {
          await tx.systemConfig.create({
            data: { key, value, updatedBy: operatorId, changeReason: changeReason || null },
          });
        }
      }
    });
    return this.findAll();
  }

  /** Get config with full version metadata */
  async getWithMeta(key: string) {
    return this.prisma.systemConfig.findUnique({ where: { key } });
  }

  /** Get change history (from changelog or version bumps) */
  async getHistory(key: string) {
    // Current version info is on the config record itself
    const config = await this.prisma.systemConfig.findUnique({ where: { key } });
    if (!config) return null;
    return {
      key: config.key,
      value: config.value,
      version: config.version,
      updatedBy: config.updatedBy,
      changeReason: config.changeReason,
      updatedAt: config.updatedAt,
      createdAt: config.createdAt,
    };
  }
}


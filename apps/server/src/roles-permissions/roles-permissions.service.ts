import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class RolesPermissionsService {
  constructor(private prisma: PrismaService) {}

  async findAllRoles() {
    const roles = await this.prisma.role.findMany({
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
      orderBy: { id: 'asc' },
    });
    return roles.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: r.rolePermissions.map((rp: any) => ({
        id: rp.permission.id,
        action: rp.permission.action,
        resource: rp.permission.resource,
        description: rp.permission.description,
      })),
    }));
  }

  async findAllPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }
}

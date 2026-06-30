import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("?? ??? ???????...");

  // 1. ????
  const resources = ["task", "store", "user", "requirement_type", "system"];
  const actions = ["create", "read", "update", "delete"];
  const permMap: Record<string, number> = {};

  for (const resource of resources) {
    for (const action of actions) {
      const perm = await prisma.permission.upsert({
        where: { action_resource: { action, resource } },
        update: {},
        create: { action, resource, description: `${action} ${resource}` },
      });
      permMap[`${action}:${resource}`] = perm.id;
    }
  }

  // 2. ????
  const adminRole = await prisma.role.upsert({
    where: { name: "ADMIN" }, update: {},
    create: { name: "ADMIN", description: "??? - ????" },
  });
  await prisma.role.upsert({
    where: { name: "MANAGER" }, update: {},
    create: { name: "MANAGER", description: "?? - ???????" },
  });
  await prisma.role.upsert({
    where: { name: "DESIGNER" }, update: {},
    create: { name: "DESIGNER", description: "??? - ???????" },
  });
  await prisma.role.upsert({
    where: { name: "OPERATOR" }, update: {},
    create: { name: "OPERATOR", description: "?? - ?????????" },
  });

  // 3. ADMIN ????
  for (const id of Object.values(permMap)) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: id },
    });
  }

  // 4. ??????? - mustChangePassword: true
  const hash = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { username: "admin" }, update: {},
    create: {
      username: "admin",
      password: hash,
      displayName: "Administrator",
      email: "admin@tianji.local",
      roleId: adminRole.id,
      mustChangePassword: true,
    },
  });

  // ????
  const opRole = await prisma.role.findUnique({ where: { name: "OPERATOR" } })!;
  const desRole = await prisma.role.findUnique({ where: { name: "DESIGNER" } })!;
  const h2 = await bcrypt.hash("operator123", 10);
  await prisma.user.upsert({
    where: { username: "operator" }, update: {},
    create: { username: "operator", password: h2, displayName: "????", email: "operator@tianji.local", roleId: opRole!.id },
  });
  const h3 = await bcrypt.hash("designer123", 10);
  await prisma.user.upsert({
    where: { username: "designer" }, update: {},
    create: { username: "designer", password: h3, displayName: "???", email: "designer@tianji.local", roleId: desRole!.id },
  });

  // 5. ??????
  const types = ["????", "?????", "A+??", "???", "????"];
  for (let i = 0; i < types.length; i++) {
    await prisma.requirementType.upsert({
      where: { name: types[i]! }, update: {},
      create: { name: types[i]!, sortOrder: i, description: `${types[i]} ????` },
    });
  }

  // 6. ????
  for (const name of ["?????", "?????", "??????", "Shopify???"]) {
    const code = name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
    await prisma.store.upsert({
      where: { code }, update: {},
      create: { name, code, description: `${name} ??` },
    });
  }

  console.log("? ?????????");
  console.log("");
  console.log("   ??????????????????????????????????????????");
  console.log("   ? ???: admin / admin123              ?");
  console.log("   ? ??:   operator / operator123       ?");
  console.log("   ? ??:   designer / designer123       ?");
  console.log("   ? ??  admin ??????????       ?");
  console.log("   ??????????????????????????????????????????");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

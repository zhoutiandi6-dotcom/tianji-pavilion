"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log("?? ??? ???????...");
    // 1. ????
    const resources = ["task", "store", "user", "requirement_type", "system"];
    const actions = ["create", "read", "update", "delete"];
    const permMap = {};
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
    const opRole = await prisma.role.findUnique({ where: { name: "OPERATOR" } });
    const desRole = await prisma.role.findUnique({ where: { name: "DESIGNER" } });
    const h2 = await bcrypt.hash("operator123", 10);
    await prisma.user.upsert({
        where: { username: "operator" }, update: {},
        create: { username: "operator", password: h2, displayName: "????", email: "operator@tianji.local", roleId: opRole.id },
    });
    const h3 = await bcrypt.hash("designer123", 10);
    await prisma.user.upsert({
        where: { username: "designer" }, update: {},
        create: { username: "designer", password: h3, displayName: "???", email: "designer@tianji.local", roleId: desRole.id },
    });
    // 5. ??????
    const types = ["????", "?????", "A+??", "???", "????"];
    for (let i = 0; i < types.length; i++) {
        await prisma.requirementType.upsert({
            where: { name: types[i] }, update: {},
            create: { name: types[i], sortOrder: i, description: `${types[i]} ????` },
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
//# sourceMappingURL=seed.js.map
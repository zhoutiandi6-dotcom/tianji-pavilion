import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 天机阁 数据种子初始化开始...");

  // ===== 1. Permissions =====
  const resources = ["task","image_task","store","requirement_type","user","system","dashboard","log","attachment"];
  const actions = ["create","read","update","delete"];
  const permMap: Record<string,number> = {};
  for(const r of resources) for(const a of actions){
    const p=await prisma.permission.upsert({where:{action_resource:{action:a,resource:r}},update:{},create:{action:a,resource:r,description:a+" "+r}});
    permMap[a+":"+r]=p.id;
  }

  // ===== 2. Roles =====
  // OWNER = system owner, unique, cannot be deleted/demoted/disabled
  await prisma.role.upsert({where:{name:"GUEST"},update:{},create:{name:"GUEST",description:"未激活用户"}});
  const orr=await prisma.role.upsert({where:{name:"OWNER"},update:{},create:{name:"OWNER",description:"系统所有者"}});
  const ar=await prisma.role.upsert({where:{name:"SUPER_ADMIN"},update:{},create:{name:"SUPER_ADMIN",description:"超级管理员"}});
  const lr=await prisma.role.upsert({where:{name:"OPERATION_MANAGER"},update:{},create:{name:"OPERATION_MANAGER",description:"运营主管"}});
  const opr=await prisma.role.upsert({where:{name:"OPERATION"},update:{},create:{name:"OPERATION",description:"运营"}});
  const dr=await prisma.role.upsert({where:{name:"DESIGNER"},update:{},create:{name:"DESIGNER",description:"设计师"}});
  const dmr=await prisma.role.upsert({where:{name:"DESIGN_MANAGER"},update:{},create:{name:"DESIGN_MANAGER",description:"设计主管"}});

  // OWNER gets all permissions (same as ADMIN)
  for(const id of Object.values(permMap)) {
    await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:ar.id,permissionId:id}},update:{},create:{roleId:ar.id,permissionId:id}});
    await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:orr.id,permissionId:id}},update:{},create:{roleId:orr.id,permissionId:id}});
  }

  const ap=async(rid:number,keys:string[])=>{for(const k of keys)if(permMap[k])await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId:rid,permissionId:permMap[k]}},update:{},create:{roleId:rid,permissionId:permMap[k]}});};
  await ap(lr.id, ["read:task","update:task","read:image_task","update:image_task","read:store","read:dashboard","read:attachment"]);
  await ap(opr.id, ["create:task","read:task","update:task","create:image_task","read:image_task","update:image_task","delete:image_task","create:attachment","read:attachment","read:store","read:requirement_type","read:dashboard"]);
  await ap(dr.id, ["read:task","read:image_task","update:image_task","read:attachment"]);
  await ap(dmr.id, ["read:task","read:image_task","update:image_task","read:store","read:dashboard","read:attachment"]);

  // ===== 3. Default Users =====
  const h=await bcrypt.hash("admin123",10);
  await prisma.user.upsert({where:{username:"admin"},update:{password:h,roleId:orr.id,mustChangePassword:false,isActive:true,lockedUntil:null,loginAttempts:0},create:{username:"admin",password:h,displayName:"Administrator",email:"admin@tianji.local",roleId:orr.id,mustChangePassword:false,isActive:true}});
  const hAdmin=await bcrypt.hash("admin123",10); await prisma.user.upsert({where:{username:"super_admin"},update:{password:hAdmin,roleId:ar.id,isActive:true,lockedUntil:null,loginAttempts:0},create:{username:"super_admin",password:hAdmin,displayName:"超级管理员",email:"super_admin@tianji.local",roleId:ar.id,isActive:true}});
  const h2=await bcrypt.hash("leader123",10); await prisma.user.upsert({where:{username:"leader"},update:{password:h2,roleId:lr.id,isActive:true,lockedUntil:null,loginAttempts:0},create:{username:"leader",password:h2,displayName:"主管",email:"leader@tianji.local",roleId:lr.id,isActive:true}});
  const h3=await bcrypt.hash("operator123",10); await prisma.user.upsert({where:{username:"operator"},update:{password:h3,roleId:opr.id,isActive:true,lockedUntil:null,loginAttempts:0},create:{username:"operator",password:h3,displayName:"运营专员",email:"operator@tianji.local",roleId:opr.id,isActive:true}});
  const h4=await bcrypt.hash("designer123",10); await prisma.user.upsert({where:{username:"designer"},update:{password:h4,roleId:dr.id,isActive:true,lockedUntil:null,loginAttempts:0},create:{username:"designer",password:h4,displayName:"设计师",email:"designer@tianji.local",roleId:dr.id,isActive:true}});
  const h5=await bcrypt.hash("dm123",10); await prisma.user.upsert({where:{username:"dm"},update:{password:h5,roleId:dmr.id,isActive:true,lockedUntil:null,loginAttempts:0},create:{username:"dm",password:h5,displayName:"设计主管",email:"dm@tianji.local",roleId:dmr.id,isActive:true}});

  // ===== 4. Requirement Types =====
  for(const[i,n] of ["仅替换文案","附图套版","场景修改","个性化定制"].entries()) {
    await prisma.requirementType.upsert({where:{name:n},update:{},create:{name:n,sortOrder:i,description:n+"相关需求"}});
  }

  // ===== 5. Stores =====
  for(const n of ["天猫旗舰店","京东旗舰店","亚马逊美国站","Shopify独立站"]) {
    const code=n.replace(/[^a-zA-Z0-9_]/g,"_").toLowerCase();
    await prisma.store.upsert({where:{code},update:{},create:{name:n,code,description:n+"店铺"}});
  }

  // ===== 6. System Config =====
  const defaults: Record<string,string> = {
    site_name: "天机阁",
    site_subtitle: "TianJi Pavilion",
    site_description: "企业内部设计协作管理平台",
    site_logo: "",
    site_version: "V1.0.0 RC-1",
    default_theme: "light",
    default_home: "/dashboard",
    login_lockout_threshold: "5",
    login_lockout_minutes: "15",
  };
  for(const [k,v] of Object.entries(defaults)) {
    await prisma.systemConfig.upsert({where:{key:k},update:{},create:{key:k,value:v}});
  }

  console.log("✅ 天机阁 数据种子初始化完成");
  console.log("  admin (Owner) / admin123 | super_admin / admin123 | leader / leader123 | operator / operator123 | designer / designer123 | dm / dm123");
}

main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());


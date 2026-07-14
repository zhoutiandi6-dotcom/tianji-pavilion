import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { PrismaService } from "../common/prisma.service";
import { OperationLogService } from "../operation-log/operation-log.service";

describe("AuthService", () => {
  let service: AuthService;
  let prisma: any;
  let jwtService: any;

  const mockUser = {
    id: 1,
    username: "admin",
    password: "$2a$10$dummyhash",
    displayName: "Admin",
    email: "admin@test.com",
    isActive: true,
    mustChangePassword: false,
    loginAttempts: 0,
    lockedUntil: null,
    role: { id: 1, name: "OWNER" },
    createdAt: new Date(),
    roleId: 1,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(mockUser),
        findFirst: jest.fn().mockResolvedValue(mockUser),
        update: jest.fn().mockResolvedValue(mockUser),
        create: jest.fn().mockResolvedValue(mockUser),
      },
      role: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, name: "OWNER" }),
      },
    };

    jwtService = {
      sign: jest.fn().mockReturnValue("test-token"),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: OperationLogService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.spyOn(require("bcryptjs"), "compare").mockResolvedValue(true);
  });

  describe("login (success path)", () => {
    it("returns access token and user data", async () => {
      const result = await service.login("admin", "admin123");
      expect(result.accessToken).toBe("test-token");
      expect(result.user.role).toBe("OWNER");
      expect(result.user.isActive).toBe(true);
    });

    it("resets loginAttempts on successful login", async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, loginAttempts: 2 });
      await service.login("admin", "admin123");
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ loginAttempts: 0, lockedUntil: null }),
        }),
      );
    });
  });

  describe("login (failure paths)", () => {
    it("throws for inactive user", async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });
      await expect(service.login("admin", "admin123")).rejects.toThrow("账号或密码错误");
    });

    it("throws for wrong password", async () => {
      jest.spyOn(require("bcryptjs"), "compare").mockResolvedValue(false);
      await expect(service.login("admin", "wrongpass")).rejects.toThrow("账号或密码错误");
    });

    it("locks account after 5 failed attempts", async () => {
      jest.spyOn(require("bcryptjs"), "compare").mockResolvedValue(false);
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, loginAttempts: 4 });
      await expect(service.login("admin", "wrongpass")).rejects.toThrow("已锁定");
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lockedUntil: expect.any(Date) }),
        }),
      );
    });

    it("throws locked message if account is locked", async () => {
      const lockedDate = new Date(Date.now() + 600000);
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, lockedUntil: lockedDate });
      await expect(service.login("admin", "admin123")).rejects.toThrow("已锁定");
    });
  });

  describe("isInitialized", () => {
    it("returns true when owner exists", async () => {
      const result = await service.isInitialized();
      expect(result.initialized).toBe(true);
    });

    it("returns false when no owner", async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      const result = await service.isInitialized();
      expect(result.initialized).toBe(false);
    });
  });
});

import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { JwtPayload } from "@tianji/types";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  async validate(payload: JwtPayload) {
    // Tokens identify the account only. Current role and active state always
    // come from the database, so role changes take effect immediately.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: { select: { name: true } } },
    });
    if (!user || !user.isActive) throw new UnauthorizedException("账号已停用或不存在");
    return { sub: user.id, username: user.username, role: user.role.name };
  }
}

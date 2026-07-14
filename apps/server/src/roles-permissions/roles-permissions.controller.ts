import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesPermissionsService } from './roles-permissions.service';

@UseGuards(AuthGuard('jwt'))
@Controller('roles-permissions')
export class RolesPermissionsController {
  constructor(private service: RolesPermissionsService) {}

  @Get('roles')
  async getRoles() {
    return this.service.findAllRoles();
  }

  @Get('permissions')
  async getPermissions() {
    return this.service.findAllPermissions();
  }
}

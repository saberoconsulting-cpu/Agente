import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'sabero_roles';
export type UserRole = 'owner' | 'admin' | 'viewer';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

import { UserRole } from '@prisma/client';

export const ROLES = UserRole;

export const ADMIN_ROLES: UserRole[] = [UserRole.ADMIN];

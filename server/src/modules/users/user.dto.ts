import type { UserDto } from '@tu-registry/shared';
import type { User } from './user.model';

export type UserDocument = InstanceType<typeof User>;

/** The only way a user leaves the server: an explicit whitelist of fields. */
export function toUserDto(user: UserDocument): UserDto {
  return {
    id: user.id as string,
    login: user.login,
    fullName: user.fullName,
    department: user.department,
    role: user.role,
    canManageRegistration: user.canManageRegistration,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: (user.get('createdAt') as Date).toISOString(),
  };
}

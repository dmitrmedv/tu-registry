import type { ObjectType, Role } from '@tu-registry/shared';

export const ROLE_LABELS: Record<Role, string> = {
  USER: 'Користувач',
  ADMIN: 'Адміністратор',
};

export const OBJECT_TYPE_LABELS: Record<ObjectType, string> = {
  DOMESTIC: 'Побутовий',
  NON_DOMESTIC: 'Непобутовий',
};

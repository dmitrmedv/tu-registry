import { ROLES } from '@tu-registry/shared';
import { ROLE_LABELS } from '@/shared/lib/labels';

export const ROLE_OPTIONS = ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

export const MANAGE_REGISTRATION_HINT =
  'Дозволяє ручну реєстрацію заяв і зміну дати й номера у власних заявах';

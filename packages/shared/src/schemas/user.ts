import { z } from 'zod';
import { type Department, DEPARTMENTS } from '../departments';
import { ROLES, type Role } from '../enums';
import { loginField } from './auth';

export const fullNameField = z
  .string()
  .trim()
  .min(2, 'ПІБ: щонайменше 2 символи')
  .max(150, 'ПІБ: не більше 150 символів');

export const departmentField = z.enum(DEPARTMENTS, { error: 'Оберіть управління' });

export const createUserSchema = z
  .object({
    login: loginField,
    fullName: fullNameField,
    department: departmentField,
    role: z.enum(ROLES).default('USER'),
    canManageRegistration: z.boolean().default(false),
  })
  .strict();

/** All editable fields; the edit form uses it whole, the API accepts any subset. */
export const editUserFormSchema = z
  .object({
    fullName: fullNameField,
    department: departmentField,
    role: z.enum(ROLES),
    canManageRegistration: z.boolean(),
    isActive: z.boolean(),
  })
  .strict();

export const updateUserSchema = editUserFormSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Немає змін для збереження');

export type CreateUserInput = z.input<typeof createUserSchema>;
export type EditUserFormValues = z.infer<typeof editUserFormSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** User as returned by the API. Never contains password data. */
export type UserDto = {
  id: string;
  login: string;
  fullName: string;
  /** Users see and work with their department's applications; admins see all. */
  department: Department;
  role: Role;
  canManageRegistration: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export type AuthResponse = { user: UserDto; accessToken: string };
export type UserWithTemporaryPassword = { user: UserDto; temporaryPassword: string };

/** Manual registration and changing date/number of own applications. */
export function hasRegistrationRights(user: Pick<UserDto, 'role' | 'canManageRegistration'>) {
  return user.role === 'ADMIN' || user.canManageRegistration;
}

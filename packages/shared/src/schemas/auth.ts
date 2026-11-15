import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 10;
/** bcrypt ignores everything after 72 bytes; Cyrillic characters take 2 bytes each. */
export const PASSWORD_MAX_BYTES = 72;

export const loginField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,50}$/, 'Логін: 3–50 символів — латинські літери, цифри, «.», «_», «-»');

export const passwordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Пароль має містити щонайменше ${PASSWORD_MIN_LENGTH} символів`)
  .refine((value) => utf8ByteLength(value) <= PASSWORD_MAX_BYTES, 'Пароль задовгий');

/** UTF-8 size of a string; works the same in Node and the browser without DOM typings. */
function utf8ByteLength(value: string) {
  let bytes = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0)!;
    bytes += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** Login form: no password policy here, only presence — the policy applies when setting one. */
export const loginSchema = z
  .object({
    login: z.string().trim().toLowerCase().min(1, 'Вкажіть логін').max(50),
    password: z.string().min(1, 'Вкажіть пароль').max(200),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Вкажіть поточний пароль').max(200),
    newPassword: passwordField,
  })
  .strict()
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ['newPassword'],
    message: 'Новий пароль має відрізнятися від поточного',
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

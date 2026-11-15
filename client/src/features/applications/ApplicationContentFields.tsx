import {
  COMMENT_MAX,
  type CreateApplicationInput,
  OBJECT_CATEGORIES,
  OBJECT_CATEGORY_OTHER_MAX,
  OBJECT_TYPES,
} from '@tu-registry/shared';
import { useFormContext } from 'react-hook-form';
import { OBJECT_CATEGORY_LABELS, OBJECT_TYPE_LABELS } from '@/shared/lib/labels';
import { ChoiceField, SelectField, TextAreaField, TextField } from '@/shared/ui';
import styles from './ApplicationForm.module.scss';

const OBJECT_TYPE_OPTIONS = [
  { value: '', label: '— оберіть —' },
  ...OBJECT_TYPES.map((type) => ({ value: type, label: OBJECT_TYPE_LABELS[type] })),
];
const OBJECT_CATEGORY_OPTIONS = OBJECT_CATEGORIES.map((category) => ({
  value: category,
  label: OBJECT_CATEGORY_LABELS[category],
}));

/**
 * The application's own data, shared by the new and the edit form. Reads the surrounding
 * form through FormProvider; both forms' values include these fields.
 */
export function ApplicationContentFields() {
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext<CreateApplicationInput>();
  const category = watch('objectCategory');

  return (
    <>
      <fieldset className={styles.section}>
        <legend>Замовник</legend>
        <div className={styles.grid}>
          <TextField label="Замовник" error={errors.customer?.message} {...register('customer')} />
          <TextField
            label="Представник замовника (необовʼязково)"
            error={errors.customerRepresentative?.message}
            {...register('customerRepresentative')}
          />
          <TextField
            label="Телефон"
            type="tel"
            autoComplete="off"
            hint="Наприклад: 067 123 45 67"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <TextField
            label="Email (необовʼязково)"
            type="email"
            autoComplete="off"
            error={errors.email?.message}
            {...register('email')}
          />
        </div>
      </fieldset>

      <fieldset className={styles.section}>
        <legend>Обʼєкт</legend>
        <div className={styles.grid}>
          <TextField
            className={styles.wide}
            label="Адреса обʼєкта"
            error={errors.objectAddress?.message}
            {...register('objectAddress')}
          />
          <SelectField
            label="Тип обʼєкта"
            options={OBJECT_TYPE_OPTIONS}
            error={errors.objectType?.message}
            {...register('objectType')}
          />
          <ChoiceField
            className={styles.wide}
            legend="Категорія обʼєкта"
            options={OBJECT_CATEGORY_OPTIONS}
            error={errors.objectCategory?.message}
            {...register('objectCategory')}
          />
          {category === 'OTHER' && (
            <TextField
              className={styles.wide}
              label="Уточніть категорію"
              maxLength={OBJECT_CATEGORY_OTHER_MAX}
              placeholder="Наприклад: котельня"
              error={errors.objectCategoryOther?.message}
              {...register('objectCategoryOther')}
            />
          )}
        </div>
      </fieldset>

      <fieldset className={styles.section}>
        <legend>Додатково</legend>
        <TextAreaField
          label="Коментар (необовʼязково)"
          maxLength={COMMENT_MAX}
          error={errors.comment?.message}
          {...register('comment')}
        />
      </fieldset>
    </>
  );
}

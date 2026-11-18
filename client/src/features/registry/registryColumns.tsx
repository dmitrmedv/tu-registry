import type { ApplicationListItemDto, SortField } from '@tu-registry/shared';
import type { ReactNode } from 'react';
import { formatCalendarDate } from '@/shared/lib/format';
import {
  AREA_TYPE_LABELS,
  GASIFICATION_TYPE_LABELS,
  CONNECTION_TYPE_LABELS,
  formatObjectCategory,
  OBJECT_TYPE_LABELS,
  REGISTRY_STAGE_LABELS,
} from '@/shared/lib/labels';

type Row = ApplicationListItemDto;

/** A registry column after «№» (which is always shown: it is the row's link). */
export type RegistryColumn = {
  id: Exclude<SortField, 'regNumber'>;
  label: string;
  cell: (row: Row, nameOfDepartment: (id: string) => string) => ReactNode;
  /** Long text wraps; short values stay on one line (cut with «…» when narrowed). */
  wrap?: boolean;
  /** The default width, px; the viewer can change it (see useRegistryColumns). */
  size: number;
  /** Shown until the viewer changes it in «Колонки». */
  visibleByDefault: boolean;
  /** Admins only: users always see one department. */
  adminOnly?: boolean;
};

const date = (value: string | null) => (value ? formatCalendarDate(value) : '—');

export const REGISTRY_COLUMNS: RegistryColumn[] = [
  {
    id: 'regDate',
    label: 'Дата реєстрації',
    size: 130,
    cell: (row) => formatCalendarDate(row.regDate),
    visibleByDefault: true,
  },
  {
    id: 'department',
    label: 'Управління',
    size: 160,
    cell: (row, nameOf) => nameOf(row.department),
    visibleByDefault: true,
    adminOnly: true,
  },
  {
    id: 'customer',
    label: 'Замовник',
    size: 240,
    cell: (row) => row.customer,
    wrap: true,
    visibleByDefault: true,
  },
  {
    id: 'settlement',
    label: 'Населений пункт',
    size: 160,
    cell: (row) => row.settlement ?? '—',
    visibleByDefault: true,
  },
  {
    id: 'areaType',
    label: 'Місцевість',
    size: 120,
    cell: (row) => (row.areaType ? AREA_TYPE_LABELS[row.areaType] : '—'),
    visibleByDefault: false,
  },
  {
    id: 'objectAddress',
    label: 'Адреса',
    size: 370,
    cell: (row) => row.objectAddress,
    wrap: true,
    visibleByDefault: true,
  },
  {
    id: 'objectType',
    label: 'Тип обʼєкта',
    size: 130,
    cell: (row) => OBJECT_TYPE_LABELS[row.objectType],
    visibleByDefault: true,
  },
  {
    id: 'objectCategory',
    label: 'Категорія',
    size: 200,
    cell: (row) => formatObjectCategory(row.objectCategory, row.objectCategoryOther),
    wrap: true,
    visibleByDefault: false,
  },
  {
    id: 'stage',
    label: 'Стан',
    size: 170,
    cell: (row) => REGISTRY_STAGE_LABELS[row.status === 'ANNULLED' ? 'ANNULLED' : row.stage],
    visibleByDefault: true,
  },
  {
    id: 'lastResponseDate',
    label: 'Дата відповіді',
    size: 130,
    cell: (row) => date(row.lastResponseDate),
    visibleByDefault: true,
  },
  {
    id: 'lastResponseNumber',
    label: 'Номер відповіді',
    size: 150,
    cell: (row) => row.lastResponseNumber ?? '—',
    visibleByDefault: false,
  },
  {
    id: 'tuDate',
    label: 'Дата ТУ',
    size: 110,
    cell: (row) => date(row.tuDate),
    visibleByDefault: true,
  },
  {
    id: 'tuNumber',
    label: 'Номер ТУ',
    size: 120,
    cell: (row) => row.tuNumber ?? '—',
    visibleByDefault: true,
  },
  {
    id: 'gasFlow',
    label: 'Витрати газу, м³/год',
    size: 120,
    cell: (row) => (row.gasFlow === null ? '—' : String(row.gasFlow).replace('.', ',')),
    visibleByDefault: false,
  },
  {
    id: 'connectionType',
    label: 'Тип приєднання',
    size: 200,
    cell: (row) => (row.connectionType ? CONNECTION_TYPE_LABELS[row.connectionType] : '—'),
    wrap: true,
    visibleByDefault: false,
  },
  {
    id: 'engineer',
    label: 'Інженер',
    size: 160,
    cell: (row) => row.engineerName ?? '—',
    visibleByDefault: true,
  },
  {
    id: 'gasificationType',
    label: 'Вид газифікації',
    size: 160,
    cell: (row) => (row.gasificationType ? GASIFICATION_TYPE_LABELS[row.gasificationType] : '—'),
    visibleByDefault: false,
  },
  {
    id: 'accountNumber',
    label: 'Особовий рахунок / № договору',
    size: 180,
    cell: (row) => row.accountNumber ?? '—',
    visibleByDefault: false,
  },
  {
    id: 'customerRepresentative',
    label: 'Представник замовника',
    size: 220,
    cell: (row) => row.customerRepresentative ?? '—',
    wrap: true,
    visibleByDefault: false,
  },
  {
    id: 'createdBy',
    label: 'Зареєстрував',
    size: 180,
    cell: (row) => row.createdBy.fullName,
    visibleByDefault: false,
  },
];

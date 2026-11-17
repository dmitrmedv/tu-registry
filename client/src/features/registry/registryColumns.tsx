import type { ApplicationListItemDto, SortField } from '@tu-registry/shared';
import type { ReactNode } from 'react';
import { formatCalendarDate } from '@/shared/lib/format';
import {
  AREA_TYPE_LABELS,
  CONNECTION_TYPE_LABELS,
  formatObjectCategory,
  OBJECT_TYPE_LABELS,
  REGISTRY_STAGE_LABELS,
} from '@/shared/lib/labels';
import styles from './registry.module.scss';

type Row = ApplicationListItemDto;

/** A registry column after «№» (which is always shown: it is the row's link). */
export type RegistryColumn = {
  id: Exclude<SortField, 'regNumber'>;
  label: string;
  cell: (row: Row, nameOfDepartment: (id: string) => string) => ReactNode;
  /** Long text wraps; short values stay on one line. */
  wrap?: boolean;
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
    cell: (row) => formatCalendarDate(row.regDate),
    visibleByDefault: true,
  },
  {
    id: 'department',
    label: 'Управління',
    cell: (row, nameOf) => nameOf(row.department),
    visibleByDefault: true,
    adminOnly: true,
  },
  {
    id: 'customer',
    label: 'Замовник',
    cell: (row) => row.customer,
    wrap: true,
    visibleByDefault: true,
  },
  {
    id: 'settlement',
    label: 'Населений пункт',
    cell: (row) => row.settlement ?? '—',
    visibleByDefault: true,
  },
  {
    id: 'areaType',
    label: 'Місцевість',
    cell: (row) => (row.areaType ? AREA_TYPE_LABELS[row.areaType] : '—'),
    visibleByDefault: false,
  },
  {
    id: 'objectAddress',
    label: 'Адреса',
    cell: (row) => <div className={styles.address}>{row.objectAddress}</div>,
    wrap: true,
    visibleByDefault: true,
  },
  {
    id: 'objectType',
    label: 'Тип обʼєкта',
    cell: (row) => OBJECT_TYPE_LABELS[row.objectType],
    visibleByDefault: true,
  },
  {
    id: 'objectCategory',
    label: 'Категорія',
    cell: (row) => formatObjectCategory(row.objectCategory, row.objectCategoryOther),
    wrap: true,
    visibleByDefault: false,
  },
  {
    id: 'stage',
    label: 'Стан',
    cell: (row) => REGISTRY_STAGE_LABELS[row.status === 'ANNULLED' ? 'ANNULLED' : row.stage],
    visibleByDefault: true,
  },
  {
    id: 'lastResponseDate',
    label: 'Дата відповіді',
    cell: (row) => date(row.lastResponseDate),
    visibleByDefault: true,
  },
  {
    id: 'lastResponseNumber',
    label: 'Номер відповіді',
    cell: (row) => row.lastResponseNumber ?? '—',
    visibleByDefault: false,
  },
  { id: 'tuDate', label: 'Дата ТУ', cell: (row) => date(row.tuDate), visibleByDefault: true },
  { id: 'tuNumber', label: 'Номер ТУ', cell: (row) => row.tuNumber ?? '—', visibleByDefault: true },
  {
    id: 'gasFlow',
    label: 'Витрати газу, м³/год',
    cell: (row) => (row.gasFlow === null ? '—' : String(row.gasFlow).replace('.', ',')),
    visibleByDefault: false,
  },
  {
    id: 'connectionType',
    label: 'Тип приєднання',
    cell: (row) => (row.connectionType ? CONNECTION_TYPE_LABELS[row.connectionType] : '—'),
    wrap: true,
    visibleByDefault: false,
  },
  {
    id: 'engineer',
    label: 'Інженер',
    cell: (row) => row.engineerName ?? '—',
    visibleByDefault: true,
  },
  {
    id: 'customerRepresentative',
    label: 'Представник замовника',
    cell: (row) => row.customerRepresentative ?? '—',
    wrap: true,
    visibleByDefault: false,
  },
  {
    id: 'createdBy',
    label: 'Зареєстрував',
    cell: (row) => row.createdBy.fullName,
    visibleByDefault: false,
  },
];

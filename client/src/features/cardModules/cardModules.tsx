import type { ApplicationDto, TimelineEventDto } from '@tu-registry/shared';
import type { ComponentType } from 'react';
import { ContractTab, useContracts } from '@/features/contracts';
import { ResponsesTab, useResponses } from '@/features/responses';
import { TechnicalConditionsTab, useTechnicalConditions } from '@/features/technicalConditions';
import {
  type AddDialogProps,
  AddResponseDialog,
  AddTechnicalConditionsDialog,
} from './AddModuleDialogs';

/**
 * A module of the application card: a stage of the processing with its own documents. It gets a
 * tab once it has a document (even a cancelled one) and is added once, through «Додати модуль»;
 * more documents of the same module are added inside its tab.
 */
type CardModule = {
  id: string;
  /** The tab's name. */
  tabLabel: string;
  /** The item of «Додати модуль». */
  menuLabel: string;
  /** The timeline events that open this tab. */
  eventTypes: TimelineEventDto['type'][];
  Tab: ComponentType<{ app: ApplicationDto }>;
  /** The first document is added in a dialog over the card… */
  AddDialog?: ComponentType<AddDialogProps>;
  /** …or on a page of its own. */
  addPath?: (applicationId: string) => string;
};

/** The modules in the order of the processing: the order of the tabs. */
export const CARD_MODULES = [
  {
    id: 'response',
    tabLabel: 'Відповідь',
    menuLabel: 'Відповідь',
    eventTypes: ['RESPONSE', 'DOCUMENTS_RECEIVED'],
    Tab: ResponsesTab,
    AddDialog: AddResponseDialog,
  },
  {
    id: 'tu',
    tabLabel: 'ТУ',
    menuLabel: 'Технічні умови',
    eventTypes: ['TECHNICAL_CONDITIONS', 'TU_INVOICE', 'TU_PAID', 'TU_ACT_TRANSFERRED'],
    Tab: TechnicalConditionsTab,
    AddDialog: AddTechnicalConditionsDialog,
  },
  {
    id: 'contract',
    tabLabel: 'Договір',
    menuLabel: 'Договір',
    eventTypes: ['CONTRACT', 'CONTRACT_SIGNED'],
    Tab: ContractTab,
    // A large form with two files: a page, not a dialog (agreed 2026-11-20).
    addPath: (applicationId) => `/applications/${applicationId}/contracts/new`,
  },
] as const satisfies readonly CardModule[];

export type CardModuleId = (typeof CARD_MODULES)[number]['id'];

const moduleOf = (id: CardModuleId) =>
  (CARD_MODULES as readonly CardModule[]).find((module) => module.id === id);

/** The dialog of a module's first document, if it is added in one. */
export const addDialogOf = (id: CardModuleId) => moduleOf(id)?.AddDialog;

/** The page of a module's first document, if it is added on one. */
export const addPathOf = (id: CardModuleId, applicationId: string) =>
  moduleOf(id)?.addPath?.(applicationId);

/**
 * Whether each module has documents yet: true or false once known, undefined while loading.
 * A new module adds its own line here.
 */
export function useModulePresence(
  applicationId: string,
): Record<CardModuleId, boolean | undefined> {
  const responses = useResponses(applicationId);
  const technicalConditions = useTechnicalConditions(applicationId);
  const contracts = useContracts(applicationId);
  return {
    response: responses.data && responses.data.length > 0,
    tu: technicalConditions.data && technicalConditions.data.length > 0,
    contract: contracts.data && contracts.data.length > 0,
  };
}

import type { ApplicationDto, TimelineEventDto } from '@tu-registry/shared';
import type { ComponentType } from 'react';
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
  AddDialog: ComponentType<AddDialogProps>;
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
    eventTypes: ['TECHNICAL_CONDITIONS'],
    Tab: TechnicalConditionsTab,
    AddDialog: AddTechnicalConditionsDialog,
  },
] as const satisfies readonly CardModule[];

export type CardModuleId = (typeof CARD_MODULES)[number]['id'];

/**
 * Whether each module has documents yet: true or false once known, undefined while loading.
 * A new module adds its own line here.
 */
export function useModulePresence(
  applicationId: string,
): Record<CardModuleId, boolean | undefined> {
  const responses = useResponses(applicationId);
  const technicalConditions = useTechnicalConditions(applicationId);
  return {
    response: responses.data && responses.data.length > 0,
    tu: technicalConditions.data && technicalConditions.data.length > 0,
  };
}

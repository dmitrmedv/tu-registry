import type { PreferenceTable, TablePreferences, TablePreferencesDto } from '@tu-registry/shared';
import { http } from '@/shared/api/http';

export const preferencesApi = {
  get: (table: PreferenceTable) =>
    http.get<TablePreferencesDto>(`/me/preferences/${table}`).then((r) => r.data),
  save: (table: PreferenceTable, preferences: TablePreferences) =>
    http.put<TablePreferencesDto>(`/me/preferences/${table}`, preferences).then((r) => r.data),
};

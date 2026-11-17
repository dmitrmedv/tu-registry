import type { ResponseDto } from '@tu-registry/shared';
import { formatCalendarDate, formatDateTime, shortName } from '@/shared/lib/format';
import { DataList, DataRow } from '@/shared/ui';

/** One response's rows, as on the «Відповідь» tab. */
export function ResponseView({ response }: { response: ResponseDto }) {
  return (
    <DataList>
      <DataRow label="Відповідь">№ {response.outgoingNumber}</DataRow>
      <DataRow label="Дата реєстрації">{formatCalendarDate(response.responseDate)}</DataRow>
      <DataRow label="Виконавець">
        <span title={response.engineer.fullName}>{shortName(response.engineer.fullName)}</span>
      </DataRow>
      {response.documentsReceivedAt && (
        <DataRow label="Документи надійшли">
          {formatCalendarDate(response.documentsReceivedAt)}
        </DataRow>
      )}
      <DataRow label="Фактична дата отримання відповіді">
        {formatDateTime(response.createdAt)}
      </DataRow>
    </DataList>
  );
}

import type { Types } from 'mongoose';
import { toIsoDate } from '../../utils/kyivDate';
import { TuPayment } from './tuPayment.model';

/**
 * The act's transfer to accounting became a month (2026-11-19): a day entered before keeps its
 * month. Through the driver: the old field is no longer in the schema.
 */
export async function moveActTransferDateToMonth() {
  const rows = await TuPayment.collection
    .find({ actTransferredDate: { $exists: true } })
    .project<{ _id: Types.ObjectId; actTransferredDate: Date | null }>({ actTransferredDate: 1 })
    .toArray();
  for (const row of rows) {
    await TuPayment.collection.updateOne(
      { _id: row._id },
      {
        $set: {
          actTransferMonth: row.actTransferredDate
            ? toIsoDate(row.actTransferredDate).slice(0, 7)
            : null,
        },
        $unset: { actTransferredDate: '' },
      },
    );
  }
  return rows.length;
}

import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTestDb } from '../../test/db';
import { clock } from '../../utils/clock';
import { Application } from '../applications/application.model';
import { createApplication, getNextNumber } from '../applications/application.service';
import { ApplicationChange } from '../applications/applicationChange.model';
import { AuditLog } from '../audit/auditLog.model';
import { Counter } from './counter.model';

const actor = { id: new Types.ObjectId().toString(), fullName: 'Тестовий Реєстратор' };

const input = {
  customer: 'ТОВ «Приклад»',
  customerRepresentative: 'Петренко Іван',
  phone: '+380671234567',
  settlement: 'м. Київ',
  objectAddress: 'вул. Прикладна, 1',
  objectType: 'DOMESTIC' as const,
  objectCategory: 'RESIDENTIAL_HOUSE' as const,
};

const register = () => createApplication(input, actor, {});

/** Pins "now" for business dates; UTC instant → see kyivDate tests for the Kyiv mapping. */
function setNow(utc: string) {
  vi.spyOn(clock, 'now').mockReturnValue(new Date(utc));
}

describe('automatic numbering', () => {
  useTestDb();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gives 50 concurrent registrations the numbers 1…50 without duplicates or gaps', async () => {
    setNow('2026-03-12T09:00:00Z');

    const results = await Promise.all(Array.from({ length: 50 }, register));

    const seqs = results.map((r) => r.regSeq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(new Set(results.map((r) => r.regNumber)).size).toBe(50);
    expect(results.every((r) => r.regYear === 2026 && r.regDate === '2026-03-12')).toBe(true);
    expect((await Counter.findById(2026))?.lastSeq).toBe(50);
    expect(await Application.countDocuments()).toBe(50);
  });

  it('formats numbers as Nт/YY and records who registered and how', async () => {
    setNow('2026-03-12T09:00:00Z');

    const first = await register();
    const second = await register();

    expect([first.regNumber, second.regNumber]).toEqual(['1т/26', '2т/26']);
    expect(first).toMatchObject({ registrationMode: 'AUTO', status: 'ACTIVE', createdBy: actor });
    expect(await ApplicationChange.countDocuments({ action: 'CREATED' })).toBe(2);
    const audit = await AuditLog.findOne({ action: 'APPLICATION_CREATED', entityId: first.id });
    expect(audit?.details).toEqual({ regNumber: '1т/26', regDate: '2026-03-12' });
  });

  it('uses the Kyiv calendar for the year: restarts at 1т/27 just after midnight on 1 January', async () => {
    setNow('2026-12-31T21:59:00Z'); // 23:59 in Kyiv
    const lastOfYear = [await register(), await register()];

    setNow('2026-12-31T22:01:00Z'); // 00:01 on 1 January in Kyiv, still 31 Dec in UTC
    const firstOfYear = await register();

    expect(lastOfYear.map((r) => r.regNumber)).toEqual(['1т/26', '2т/26']);
    expect(lastOfYear[1]!.regDate).toBe('2026-12-31');
    expect(firstOfYear.regNumber).toBe('1т/27');
    expect(firstOfYear.regDate).toBe('2027-01-01');
  });

  it('skips numbers already taken by manual registration', async () => {
    setNow('2026-03-12T09:00:00Z');
    await Application.create({
      ...input,
      regYear: 2026,
      regSeq: 2,
      regDate: new Date('2026-02-01T00:00:00Z'),
      registrationMode: 'MANUAL',
      createdBy: actor.id,
    });

    const seqs = [(await register()).regSeq, (await register()).regSeq, (await register()).regSeq];

    expect(seqs).toEqual([1, 3, 4]);
  });

  it('rolls everything back, including the counter, if any step fails', async () => {
    setNow('2026-03-12T09:00:00Z');
    vi.spyOn(AuditLog, 'create').mockRejectedValueOnce(new Error('audit storage down'));

    await expect(register()).rejects.toThrow('audit storage down');

    expect(await Application.countDocuments()).toBe(0);
    expect(await ApplicationChange.countDocuments()).toBe(0);
    expect((await Counter.findById(2026))?.lastSeq ?? 0).toBe(0);
    // The number was not burnt.
    expect((await register()).regNumber).toBe('1т/26');
  });

  it('shows the next number without reserving it', async () => {
    setNow('2026-03-12T09:00:00Z');
    await register();

    const hint = await getNextNumber();
    const again = await getNextNumber();

    expect(hint).toEqual({ regNumber: '2т/26', regYear: 2026, regSeq: 2, regDate: '2026-03-12' });
    expect(again.regSeq).toBe(2);
    expect((await Counter.findById(2026))?.lastSeq).toBe(1);
  });
});

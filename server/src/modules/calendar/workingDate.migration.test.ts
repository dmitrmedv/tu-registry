import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { APPLICATIONS, registerApplication, signedInWithAuth } from '../../test/applications';
import { useTestDb } from '../../test/db';
import { clock } from '../../utils/clock';
import { fromIsoDate, toIsoDate } from '../../utils/kyivDate';
import { Application } from '../applications/application.model';
import { ApplicationChange } from '../applications/applicationChange.model';
import { Engineer } from '../engineers/engineer.model';
import { Project } from '../projects/project.model';
import { TechnicalConditions } from '../technicalConditions/technicalConditions.model';
import { CalendarDay } from './calendarDay.model';
import { applyWorkingDateMoves, planWorkingDateMoves } from './workingDate.migration';

const app = createApp();

describe('moving the saved dates to working days', () => {
  useTestDb();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('moves a date on a day off to the working day before, with its history', async () => {
    // Registered automatically on Saturday 07.11.2026.
    const now = vi.spyOn(clock, 'now').mockReturnValue(new Date('2026-11-07T09:00:00Z'));
    const owner = await signedInWithAuth(app, { login: 'owner' });
    const admin = await signedInWithAuth(app, { login: 'boss', role: 'ADMIN' });
    const applicationId = (await registerApplication(app, owner)).id;
    const engineer = await Engineer.create({
      fullName: 'Бойко Андрій',
      department: 'ODESA',
      createdBy: admin.user._id,
    });
    now.mockReturnValue(new Date('2026-11-21T09:00:00Z'));
    await request(app)
      .post(`${APPLICATIONS}/${applicationId}/technical-conditions`)
      .set(owner.auth)
      .send({
        tuNumber: '0032/ТУ',
        preparedDate: '2026-11-16',
        engineer: String(engineer._id),
        gasFlow: '2,5',
        connectionType: 'STANDARD',
        gasPressure: 'LOW',
        connectionPoint: 'UNDERGROUND',
      });
    const project = await request(app)
      .post(`${APPLICATIONS}/${applicationId}/projects`)
      .set(owner.auth)
      .send({
        approvalNumber: '125/П',
        approvalDate: '2026-11-18',
        designOrganization: 'ТОВ «Проєктбуд»',
      });
    // Saved before the rule: on Sunday 15.11; Friday 13.11 is declared off since.
    await Project.updateOne(
      { _id: project.body.id },
      { $set: { approvalDate: fromIsoDate('2026-11-15') } },
    );
    await CalendarDay.create({
      _id: '2026-11-13',
      kind: 'NON_WORKING',
      description: 'Вихідний',
      createdBy: admin.user._id,
      updatedBy: admin.user._id,
    });

    const moves = await planWorkingDateMoves();
    expect(moves).toEqual([
      expect.objectContaining({
        kind: null,
        changes: [{ field: 'regDate', from: '2026-11-07', to: '2026-11-06' }],
      }),
      expect.objectContaining({
        kind: 'PROJECT',
        number: '125/П',
        changes: [{ field: 'approvalDate', from: '2026-11-15', to: '2026-11-12' }],
      }),
    ]);
    // The plan changes nothing.
    expect(toIsoDate((await Project.findById(project.body.id).lean())!.approvalDate)).toBe(
      '2026-11-15',
    );

    expect(await applyWorkingDateMoves(moves, admin.user.id)).toBe(2);
    const saved = (await Project.findById(project.body.id).lean())!;
    expect(toIsoDate(saved.approvalDate)).toBe('2026-11-12');
    expect(saved.version).toBe(2);
    expect(toIsoDate((await Application.findById(applicationId).lean())!.regDate)).toBe(
      '2026-11-06',
    );
    expect(toIsoDate((await TechnicalConditions.findOne().lean())!.preparedDate)).toBe(
      '2026-11-16',
    );
    const history = await ApplicationChange.find({ changedBy: admin.user._id }).lean();
    expect(history.map((entry) => entry.changes)).toEqual([
      [{ field: 'regDate', oldValue: '2026-11-07', newValue: '2026-11-06' }],
      [{ field: 'approvalDate', oldValue: '2026-11-15', newValue: '2026-11-12' }],
    ]);
    // Nothing is left to move.
    expect(await planWorkingDateMoves()).toEqual([]);
  });
});

import type { Department } from '@tu-registry/shared';
import { type InferSchemaType, Schema, model } from 'mongoose';

/**
 * One document per calendar year and department ("2026:ODESA"): each department numbers its
 * applications separately. lastSeq is the last number issued *automatically*; manual
 * registrations never change it. Only the numbering module may write here.
 */
const counterSchema = new Schema(
  {
    _id: { type: String, required: true }, // counterId(year, department)
    lastSeq: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true, versionKey: false },
);

export type CounterData = InferSchemaType<typeof counterSchema>;
export const Counter = model('Counter', counterSchema);

export const counterId = (year: number, department: Department) => `${year}:${department}`;

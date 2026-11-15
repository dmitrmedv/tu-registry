import { type InferSchemaType, Schema, model } from 'mongoose';

/**
 * One document per calendar year. lastSeq is the last number issued *automatically*;
 * manual registrations never change it. Only the numbering module may write here.
 */
const counterSchema = new Schema(
  {
    _id: { type: Number, required: true }, // the year, e.g. 2026
    lastSeq: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true, versionKey: false },
);

export type CounterData = InferSchemaType<typeof counterSchema>;
export const Counter = model('Counter', counterSchema);

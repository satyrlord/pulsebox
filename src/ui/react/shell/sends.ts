import { SEND_BUS_IDS, type SendBusId } from "../../../contracts";

/** The four fixed send buses, ordered A through D. */
export const SENDS = ["A", "B", "C", "D"] as const;

export type SendLetter = (typeof SENDS)[number];

export function sendIdFor(index: number): SendBusId {
  const id = SEND_BUS_IDS[index];
  if (id === undefined) throw new Error("A fixed send bus is missing.");
  return id;
}

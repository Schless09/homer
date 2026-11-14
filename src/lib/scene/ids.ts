import { customAlphabet } from "nanoid";

const nano = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 8);

export function newId(prefix: string): string {
  return `${prefix}_${nano()}`;
}

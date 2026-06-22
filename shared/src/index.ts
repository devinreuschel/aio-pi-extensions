import { Type } from "typebox";

/** common string param for tools */
export const nameParam = Type.String({ description: "Name" });

/** format a greeting */
export function greet(name: string): string {
  return `Hello, ${name}!`;
}

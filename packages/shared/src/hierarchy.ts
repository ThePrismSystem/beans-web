import type { BeanType } from "./enums.js";

export function validParentTypes(type: BeanType): BeanType[] | null {
  switch (type) {
    case "milestone":
      return null;
    case "epic":
      return ["milestone"];
    case "feature":
      return ["milestone", "epic"];
    case "task":
    case "bug":
      return ["milestone", "epic", "feature"];
  }
}

export function canParent(childType: BeanType, parentType: BeanType): boolean {
  const valid = validParentTypes(childType);
  return valid !== null && valid.includes(parentType);
}

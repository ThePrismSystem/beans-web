import { describe, expect, it } from "vitest";

import {
  ADD_BLOCKED_BY_MUTATION,
  ADD_BLOCKING_MUTATION,
  BEAN_DETAIL_QUERY,
  CREATE_BEAN_MUTATION,
  DELETE_BEAN_MUTATION,
  REMOVE_BLOCKED_BY_MUTATION,
  REMOVE_BLOCKING_MUTATION,
  SET_PARENT_MUTATION,
  UPDATE_BEAN_MUTATION,
} from "./operations.js";

// These are plain template-literal strings (not codegen-validated at build
// time), so a typo'd field or operation name would only surface as a runtime
// GraphQL error against the real `beans` schema. These smoke tests catch
// that class of regression cheaply: each operation names itself correctly
// and references the arguments/fields the web app's hooks depend on.
describe("GraphQL operation documents", () => {
  it.each([
    ["BEAN_DETAIL_QUERY", BEAN_DETAIL_QUERY, "query BeanDetail", "bean(id: $id)"],
    ["UPDATE_BEAN_MUTATION", UPDATE_BEAN_MUTATION, "mutation UpdateBean", "updateBean(id: $id"],
    ["CREATE_BEAN_MUTATION", CREATE_BEAN_MUTATION, "mutation CreateBean", "createBean(input:"],
    ["DELETE_BEAN_MUTATION", DELETE_BEAN_MUTATION, "mutation DeleteBean", "deleteBean(id: $id)"],
    ["SET_PARENT_MUTATION", SET_PARENT_MUTATION, "mutation SetParent", "setParent(id: $id"],
    ["ADD_BLOCKING_MUTATION", ADD_BLOCKING_MUTATION, "mutation AddBlocking", "addBlocking(id: $id"],
    [
      "REMOVE_BLOCKING_MUTATION",
      REMOVE_BLOCKING_MUTATION,
      "mutation RemoveBlocking",
      "removeBlocking(id: $id",
    ],
    [
      "ADD_BLOCKED_BY_MUTATION",
      ADD_BLOCKED_BY_MUTATION,
      "mutation AddBlockedBy",
      "addBlockedBy(id: $id",
    ],
    [
      "REMOVE_BLOCKED_BY_MUTATION",
      REMOVE_BLOCKED_BY_MUTATION,
      "mutation RemoveBlockedBy",
      "removeBlockedBy(id: $id",
    ],
  ])("%s declares its operation and calls the matching field", (_name, document, header, call) => {
    expect(document).toContain(header);
    expect(document).toContain(call);
  });

  it("BEAN_DETAIL_QUERY requests both relationship ids and expanded relationship beans", () => {
    expect(BEAN_DETAIL_QUERY).toContain("parentId");
    expect(BEAN_DETAIL_QUERY).toContain("blockingIds");
    expect(BEAN_DETAIL_QUERY).toContain("blockedByIds");
    expect(BEAN_DETAIL_QUERY).toContain("parent {");
    expect(BEAN_DETAIL_QUERY).toContain("children {");
    expect(BEAN_DETAIL_QUERY).toContain("blocking {");
    expect(BEAN_DETAIL_QUERY).toContain("blockedBy {");
  });

  it("no mutation document references ifMatch (disabled pending an upstream beans fix)", () => {
    for (const document of [
      UPDATE_BEAN_MUTATION,
      CREATE_BEAN_MUTATION,
      DELETE_BEAN_MUTATION,
      SET_PARENT_MUTATION,
      ADD_BLOCKING_MUTATION,
      REMOVE_BLOCKING_MUTATION,
      ADD_BLOCKED_BY_MUTATION,
      REMOVE_BLOCKED_BY_MUTATION,
    ]) {
      expect(document).not.toContain("ifMatch");
    }
  });
});

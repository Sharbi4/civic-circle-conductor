import { describe, expect, it } from "vitest";

import { Route } from "@/routes/index";

describe("homepage footer year", () => {
  it("comes from the server loader, not the visitor's device clock", () => {
    // A visitor whose device says 2025 must still see the current year: the
    // homepage loader runs on Civi's server and the value is shipped to the page.
    const loader = Route.options.loader as (() => { year: number }) | undefined;

    expect(loader).toBeTypeOf("function");
    expect(loader?.().year).toBe(new Date().getFullYear());
  });
});

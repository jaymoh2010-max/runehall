import { describe, expect, it } from "vitest";
import { bootstrapPolicy } from "../src/shared/registration";

describe("bootstrap registration policy", () => {
  it("allows the first account without a token in development", () => {
    expect(bootstrapPolicy({ userCount: 0, token: "", nodeEnv: "development" })).toEqual({
      bootstrap: true,
      tokenConfigured: false,
      tokenRequired: false,
      canRegister: true,
    });
  });

  it("requires a configured token when one is present", () => {
    const policy = bootstrapPolicy({
      userCount: 0,
      token: "one-time-token",
      nodeEnv: "development",
    });
    expect(policy.tokenRequired).toBe(true);
    expect(policy.canRegister).toBe(true);
  });

  it("blocks the first production account until the host sets a token", () => {
    const policy = bootstrapPolicy({ userCount: 0, token: "", nodeEnv: "production" });
    expect(policy.tokenRequired).toBe(true);
    expect(policy.tokenConfigured).toBe(false);
    expect(policy.canRegister).toBe(false);
  });

  it("allows the first production account once the token is configured", () => {
    const policy = bootstrapPolicy({
      userCount: 0,
      token: "one-time-token",
      nodeEnv: "production",
    });
    expect(policy.tokenRequired).toBe(true);
    expect(policy.canRegister).toBe(true);
  });

  it("does not re-gate existing installs", () => {
    const policy = bootstrapPolicy({ userCount: 3, token: "", nodeEnv: "production" });
    expect(policy.bootstrap).toBe(false);
    expect(policy.tokenRequired).toBe(false);
    expect(policy.canRegister).toBe(true);
  });
});

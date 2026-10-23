import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./auth-errors";

describe("authentication error messages", () => {
  it("explains the setup needed when the email service rejects non-team addresses", () => {
    expect(authErrorMessage({ code: "email_address_not_authorized", message: "Email address not authorized" })).toContain("site owner needs to finish setting up email delivery");
  });

  it("distinguishes the email delivery quota from short request throttles", () => {
    expect(authErrorMessage({ code: "over_email_send_rate_limit", status: 429, message: "Email rate limit exceeded" })).toContain("email delivery limit");
    expect(authErrorMessage({ code: "over_request_rate_limit", message: "Rate limit exceeded" })).toContain("wait a minute");
    expect(authErrorMessage({ status: 429, message: "Rate limit exceeded" })).toContain("wait a minute");
  });

  it("preserves useful messages for other failures", () => {
    expect(authErrorMessage({ message: "Invalid login credentials" })).toBe("Invalid login credentials");
  });
});

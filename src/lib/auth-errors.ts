type AuthFailure = { code?: string; message: string; status?: number };

export function authErrorMessage(error: AuthFailure): string {
  if (error.code === "email_address_not_authorized") {
    return "Confirmation emails are currently restricted to the site's test team. The site owner needs to finish setting up email delivery before you can sign up.";
  }
  if (error.code === "over_email_send_rate_limit") {
    return "The email delivery limit has been reached. Please try again later. If this keeps happening, contact the site owner.";
  }
  if (error.code === "over_request_rate_limit" || error.status === 429) {
    return "Too many requests. Please wait a minute before trying again.";
  }
  return error.message;
}

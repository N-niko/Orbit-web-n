import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orbit — Your campus, a little closer",
  description: "Find your people, make plans, and share everyday campus life. Your student community, all in one Orbit.",
  applicationName: "Orbit"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}

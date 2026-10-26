import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orbit — Caldwell campus life",
  description: "Roommate tasks and expenses, events, clubs and a student marketplace for Caldwell University.",
  applicationName: "Orbit"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}

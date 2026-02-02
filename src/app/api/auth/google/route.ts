import { getAuthUrl, isAuthenticated } from "@/lib/google-calendar";
import { NextResponse } from "next/server";

export async function GET() {
  // Check if already authenticated
  if (isAuthenticated()) {
    return NextResponse.json({ authenticated: true });
  }

  // Return auth URL for user to visit
  const authUrl = getAuthUrl();
  return NextResponse.redirect(authUrl);
}

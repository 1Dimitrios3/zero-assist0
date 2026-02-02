import { getTokensFromCode } from "@/lib/google-calendar";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/?error=no_code_provided", request.url)
    );
  }

  try {
    await getTokensFromCode(code);
    return NextResponse.redirect(
      new URL("/?success=google_connected", request.url)
    );
  } catch (err) {
    console.error("Error exchanging code for tokens:", err);
    return NextResponse.redirect(
      new URL("/?error=token_exchange_failed", request.url)
    );
  }
}

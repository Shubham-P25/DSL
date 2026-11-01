import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const pubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
const isPlaceholder = !pubKey || pubKey.includes("xxx") || pubKey.includes("Y2xlcmsuZXhhbXBsZS5jb20k") || pubKey.includes("example.com");

const isPublic = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)", "/status"]);

export default isPlaceholder
  ? () => NextResponse.next()
  : clerkMiddleware((auth, req) => {
      if (!isPublic(req)) auth().protect();
    });

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};

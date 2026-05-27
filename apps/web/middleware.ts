import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that don't require authentication
// Routes that don't require authentication AND should bounce authed users
// away (to /dashboard). Only /login matches this — there's nothing useful
// for an already-authed user to do on the login page.
const PUBLIC_ROUTES = ["/login"];

// Routes that are reachable both signed-in and signed-out. The page decides
// what to render. /signup is here because the wizard creates the session
// part-way through and steps 3-6 continue on the same /signup URL after
// sign-in — middleware must not bounce. / (landing) is here so the logo
// link works for both visitors and authed users.
const ALWAYS_OPEN_ROUTES = ["/", "/signup"];

// Role-based route restrictions
const ROLE_ROUTES: { prefix: string; allowed: string[] }[] = [
  { prefix: "/super-admin", allowed: ["super_admin"] },
  { prefix: "/admin", allowed: ["owner", "admin", "super_admin"] },
];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // 1. Update the request cookies so downstream RSCs see fresh tokens
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // 2. Clone the response so cookie writes are preserved
          supabaseResponse = NextResponse.next({ request });
          // 3. Write cookies to the response so the browser stores them
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do NOT use supabase.auth.getSession() here.
  // getUser() sends a request to the Supabase Auth server every time,
  // which guarantees the token is validated. getSession() only reads
  // from the cookie and can be spoofed.
  //
  // Fail-open on transient Supabase Auth failures so a flake on the
  // upstream auth API doesn't crash every page load with a 500. We log
  // the failure with a stable prefix and treat the request as
  // unauthenticated for this hop — the downstream layout will either
  // redirect to /login (for protected routes) or render the public
  // landing/signup page as usual.
  let user: { id: string; user_metadata?: { role?: string } } | null = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (err) {
    console.error("[middleware:auth] getUser threw", {
      path: request.nextUrl.pathname,
      error: err instanceof Error ? err.message : String(err),
    });
    user = null;
  }

  const { pathname } = request.nextUrl;
  const isPublicRoute = PUBLIC_ROUTES.some((route) =>
    pathname.startsWith(route)
  );
  const isAlwaysOpen = ALWAYS_OPEN_ROUTES.includes(pathname);

  // Any redirect we return MUST carry forward the cookies that getUser()
  // may have refreshed via the setAll adapter — otherwise the browser
  // keeps using the stale tokens, getUser() returns null on the next hop,
  // and middleware redirects again → ERR_TOO_MANY_REDIRECTS.
  // (Documented Supabase + Next.js middleware gotcha.)
  function redirectWithCookies(url: URL): NextResponse {
    const res = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => {
      res.cookies.set(c.name, c.value, c);
    });
    return res;
  }

  // --- Unauthenticated user trying to access a protected route ---
  if (!user && !isPublicRoute && !isAlwaysOpen) {
    // API routes return JSON 401 instead of redirecting to /login.
    // A redirect to the HTML login page poisons callers that do
    // `await res.json()` (e.g. the softphone's credentials fetch),
    // since fetch follows the 302 and the login page returns 200 HTML.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const redirectUrl = new URL("/login", request.url);
    // Preserve the original destination so we can redirect back after login
    redirectUrl.searchParams.set("next", pathname);
    return redirectWithCookies(redirectUrl);
  }

  // --- Authenticated user on login/signup page → send to dashboard ---
  if (user && isPublicRoute) {
    return redirectWithCookies(new URL("/dashboard", request.url));
  }

  // --- Role-based access control ---
  if (user) {
    const role = user.user_metadata?.role as string | undefined;

    for (const { prefix, allowed } of ROLE_ROUTES) {
      if (pathname.startsWith(prefix) && (!role || !allowed.includes(role))) {
        // User doesn't have the required role — redirect to dashboard
        return redirectWithCookies(new URL("/", request.url));
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - Public assets (images, fonts, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|pdfjs/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|mjs|js|map)$).*)",
  ],
};

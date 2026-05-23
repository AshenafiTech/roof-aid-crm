import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/login"];

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicRoute = PUBLIC_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

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
  if (!user && !isPublicRoute) {
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

  // --- Authenticated user on login page → send to dashboard ---
  if (user && isPublicRoute) {
    return redirectWithCookies(new URL("/", request.url));
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

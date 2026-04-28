import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Reuse the cached server render of dynamic segments (e.g. /prospects with
    // filters) for 30s after navigation away. Without this, router.back() and
    // browser-back re-fetch the prospects list every time, making the return
    // trip from a detail page feel sluggish. Server actions on the detail page
    // call revalidatePath("/prospects"), so post-mutation freshness is still
    // guaranteed.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;

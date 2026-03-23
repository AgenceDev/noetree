"use client";

import { ConvexQueryClient } from "@convex-dev/react-query";
import { ConvexReactClient } from "convex/react";
import {
  QueryClient,
  QueryClientProvider as TanStackQueryClientProvider
} from "@tanstack/react-query";
import { ReactNode } from "react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const convexQueryClient = new ConvexQueryClient(convex);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryKeyHashFn: convexQueryClient.hashFn(),
      queryFn: convexQueryClient.queryFn()
    }
  }
});
convexQueryClient.connect(queryClient);

export function ConvexClientProvider({
  children
}: Readonly<{ children: ReactNode }>) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <TanStackQueryClientProvider client={queryClient}>
        {children}
      </TanStackQueryClientProvider>
    </ConvexProviderWithClerk>
  );
}

"use client";

import { ClerkProvider, Show, SignIn } from "@clerk/react";

import Header from "./Header";
import Workspace from "./Workspace";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!;

const APPEARANCE = {
  variables: {
    colorPrimary: "#38BDF8",
    colorBackground: "#111827",
    colorForeground: "#F1F5F9",
    colorInput: "#090D16",
    colorInputForeground: "#F1F5F9",
  },
};

/** Clerk sign-in until signed in, then the workspace. API calls use Clerk's same-origin session cookie. */
export default function App() {
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/" appearance={APPEARANCE}>
      <Show when="signed-out">
        <div className="m-auto flex flex-col items-center gap-4 py-12">
          <h1 className="text-2xl font-semibold text-primary">JobFit</h1>
          <SignIn routing="hash" />
        </div>
      </Show>
      <Show when="signed-in">
        <div className="flex h-screen flex-col">
          <Header />
          <Workspace />
        </div>
      </Show>
    </ClerkProvider>
  );
}

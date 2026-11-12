import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import App from "@/components/App";

import { mockFetch } from "./fetchMock";

const clerk = vi.hoisted(() => ({ signedIn: false, providerProps: {} as Record<string, unknown> }));

vi.mock("@clerk/react", () => ({
  ClerkProvider: ({ children, ...props }: { children: React.ReactNode }) => {
    clerk.providerProps = props;
    return children;
  },
  Show: ({ when, children }: { when: string; children: React.ReactNode }) =>
    (when === "signed-in") === clerk.signedIn ? children : null,
  SignIn: (props: { routing: string }) => <div data-testid="clerk-sign-in" data-routing={props.routing} />,
  UserButton: () => <button>User menu</button>,
}));

beforeEach(() => {
  mockFetch({});
});

test("signed out shows Clerk sign-in and no workspace", () => {
  clerk.signedIn = false;
  render(<App />);
  expect(screen.getByTestId("clerk-sign-in")).toHaveAttribute("data-routing", "hash");
  expect(screen.queryByRole("main")).not.toBeInTheDocument();
});

test("signed in shows header with user menu and the workspace", () => {
  clerk.signedIn = true;
  render(<App />);
  expect(screen.getByRole("heading", { name: "JobFit" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "User menu" })).toBeInTheDocument();
  expect(screen.getByRole("main")).toBeInTheDocument();
  expect(screen.getByRole("complementary", { name: "AI chat" })).toBeInTheDocument();
  expect(screen.queryByTestId("clerk-sign-in")).not.toBeInTheDocument();
});

test("provider gets the publishable key and returns to / after sign out", () => {
  render(<App />);
  expect(clerk.providerProps).toMatchObject({
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    afterSignOutUrl: "/",
  });
});

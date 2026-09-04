/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SetupStages } from "./setup-stages";

afterEach(cleanup);

describe("the setup stage player", () => {
  it("opens on Detect with real content, not an empty frame", () => {
    render(<SetupStages />);
    expect(screen.getByRole("tab", { selected: true }).textContent).toMatch(
      /Detect/,
    );
    expect(screen.getByRole("tabpanel").textContent).toMatch(
      /Checking this machine first/,
    );
  });

  it("switches screens when a stage is picked", () => {
    render(<SetupStages />);
    fireEvent.click(screen.getByRole("tab", { name: /Confirm/ }));
    expect(screen.getByRole("tabpanel").textContent).toMatch(
      /Here is the plan/,
    );
    expect(screen.getByText("Stage 3 of 6")).toBeTruthy();
  });

  it("play becomes stop, and picking a stage stops it", () => {
    render(<SetupStages />);
    const play = screen.getByRole("button", { name: /Play walkthrough/ });
    fireEvent.click(play);
    expect(play.textContent).toBe("Stop");
    fireEvent.click(screen.getByRole("tab", { name: /Summary/ }));
    expect(play.textContent).toBe("Play walkthrough");
    expect(screen.getByRole("tabpanel").textContent).toMatch(
      /installed by this run/,
    );
  });
});

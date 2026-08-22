import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateTime, Settings } from "luxon";

vi.mock("../../src/components/ui/sidebar.tsx", () => {
  return {
    SidebarTrigger: () => null,
  };
});

import AppCalendar from "../../src/components/calendar/Calendar.tsx";
import { CalendarProvider } from "../../src/context/CalendarContext.tsx";
import type { CalendarEvent } from "../../src/types/calendar/Event.ts";

const FIXED_NOW = DateTime.fromISO("2026-03-18T10:30:00");
const TODAY_LABEL = FIXED_NOW.toFormat("EEE d");

const WEEK_LABELS = Array.from({ length: 7 }, (_, i) =>
  FIXED_NOW.startOf("week").plus({ days: i }).toFormat("EEE d"),
);
const GRID_HEADER_HEIGHT = 48;
const HOUR_HEIGHT = 60;
const TIME_GUTTER_WIDTH = 64;
const DAY_WIDTH = 100;
const HOUR_LABELS = Array.from(
  { length: 24 },
  (_, i) => `${((i + 11) % 12) + 1} ${i < 12 ? "AM" : "PM"}`,
);

const buildEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "plain-event",
  title: "Planning",
  description: "Sprint planning",
  start: FIXED_NOW.startOf("day").plus({ hours: 9 }),
  end: FIXED_NOW.startOf("day").plus({ hours: 10 }),
  timestamp: FIXED_NOW.toMillis(),
  ...overrides,
});

const buildPlainEvent = (): CalendarEvent => buildEvent();

const buildRecurringEvent = (
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent =>
  buildEvent({
    id: "repeat-parent",
    title: "Daily standup",
    description: undefined,
    start: FIXED_NOW.startOf("week").plus({ days: 2, hours: 8 }),
    end: FIXED_NOW.startOf("week").plus({ days: 2, hours: 9 }),
    repeat: {
      interval: 1,
      unit: "day" as const,
    },
    ...overrides,
  });

const renderCalendar = ({
  events = [],
  mode = "day",
  saveEvents = vi.fn(),
  setMode = vi.fn(),
}: {
  events?: CalendarEvent[];
  mode?: "day" | "week";
  saveEvents?: ReturnType<typeof vi.fn>;
  setMode?: ReturnType<typeof vi.fn>;
} = {}) => {
  const user = userEvent.setup();

  const renderResult = render(
    <CalendarProvider>
      <AppCalendar
        events={events}
        mode={mode}
        setMode={setMode}
        saveEvents={saveEvents}
        syncEvents={vi.fn()}
      />
    </CalendarProvider>,
  );

  return { user, saveEvents, setMode, ...renderResult };
};

const advanceSave = async () => {
  await new Promise((resolve) => setTimeout(resolve, 150));
};

const getLastSavedEvents = (saveEvents: ReturnType<typeof vi.fn>) => {
  expect(saveEvents).toHaveBeenCalled();
  return saveEvents.mock.lastCall?.[0] as CalendarEvent[];
};

const getDayCell = (dayIndex = 0) => {
  const cell = document.querySelector(
    `.grid-cell[data-day-index="${dayIndex}"]`,
  ) as HTMLDivElement | null;

  expect(cell).toBeTruthy();
  return cell!;
};

const getEventBlock = async (title: string) => {
  const labels = await screen.findAllByText(title);
  const label = labels.find((node) => node.closest(".event-block")) ?? labels[0];
  const block = label.closest(".event-block") as HTMLDivElement | null;

  expect(block).toBeTruthy();
  return block!;
};

const openEventEditor = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
  await user.dblClick(await getEventBlock(title));
  expect(
    await screen.findByRole("heading", { name: /edit event/i }),
  ).toBeInTheDocument();
};

const openEventMenu = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
  await user.pointer({
    target: await getEventBlock(title),
    keys: "[MouseRight]",
  });
};

const countEventBlocks = (title: string) =>
  Array.from(document.querySelectorAll(".event-block")).filter((node) =>
    node.textContent?.includes(title),
  ).length;

const makeRect = (left: number, top: number, width: number, height: number) => ({
  x: left,
  y: top,
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  toJSON: () => {},
}) as DOMRect;

const dayCenterX = (dayIndex: number) =>
  TIME_GUTTER_WIDTH + DAY_WIDTH * dayIndex + DAY_WIDTH / 2;

const timeToClientY = (hour: number, minute = 0) =>
  GRID_HEADER_HEIGHT + hour * HOUR_HEIGHT + minute;

const dispatchWindowPointer = (
  type: "pointermove" | "pointerup",
  init: PointerEventInit,
) => {
  act(() => {
    window.dispatchEvent(new PointerEvent(type, { bubbles: true, ...init }));
  });
};

const dragEvent = async ({
  title,
  source = "move",
  startX,
  startY,
  endX,
  endY,
}: {
  title: string;
  source?: "move" | "resize_start" | "resize_end";
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}) => {
  const block = await getEventBlock(title);
  const target =
    source === "move"
      ? block
      : Array.from(block.querySelectorAll("div")).find((node) => {
          const className = node.className;
          return (
            typeof className === "string" &&
            className.includes("cursor-ns-resize") &&
            className.includes(source === "resize_start" ? "top-0" : "bottom-0")
          );
        });

  expect(target).toBeTruthy();

  fireEvent.pointerDown(target!, {
    button: 0,
    pointerId: 1,
    pointerType: "mouse",
    clientX: startX,
    clientY: startY,
  });

  dispatchWindowPointer("pointermove", {
    button: 0,
    pointerId: 1,
    pointerType: "mouse",
    clientX: endX,
    clientY: endY,
  });
  dispatchWindowPointer("pointerup", {
    button: 0,
    pointerId: 1,
    pointerType: "mouse",
    clientX: endX,
    clientY: endY,
  });
};

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
  Settings.now = () => FIXED_NOW.toMillis();
  vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW.toMillis());

  Element.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};

  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      if (this.classList.contains("grid")) {
        return makeRect(0, 0, TIME_GUTTER_WIDTH + DAY_WIDTH * 7, 1488);
      }

      if (this.hasAttribute("data-day-index")) {
        const dayIndex = Number(this.getAttribute("data-day-index"));
        return makeRect(
          TIME_GUTTER_WIDTH + dayIndex * DAY_WIDTH,
          GRID_HEADER_HEIGHT,
          DAY_WIDTH,
          HOUR_HEIGHT * 24,
        );
      }

      if (this.classList.contains("event-block")) {
        return makeRect(200, 200, 120, 80);
      }

      return originalGetBoundingClientRect.call(this);
    },
  );

  let id = 0;
  vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => {
    id += 1;
    return `00000000-0000-0000-0000-${String(id).padStart(12, "0")}`;
  });
});

afterEach(() => {
  Settings.now = () => Date.now();
});

describe("Calendar", () => {
  it("renders day view scaffold", async () => {
    renderCalendar();

    expect(await screen.findByText(/today/i)).toBeInTheDocument();
    expect(screen.getByText(TODAY_LABEL)).toBeInTheDocument();

    for (const label of HOUR_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders week view with expanded recurring events", async () => {
    renderCalendar({
      mode: "week",
      events: [buildPlainEvent(), buildRecurringEvent()],
    });

    for (const label of WEEK_LABELS) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }

    expect(await screen.findByText("Planning")).toBeInTheDocument();
    expect((await screen.findAllByText("Daily standup")).length).toBeGreaterThan(1);
  });

  it("moves between days and returns to today", async () => {
    const { user } = renderCalendar();

    expect(await screen.findByText("Wed 18")).toBeInTheDocument();

    await user.click(screen.getByTestId("next-btn"));
    await waitFor(() => {
      expect(screen.getByText("Thu 19")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /today/i }));
    await waitFor(() => {
      expect(screen.getByText("Wed 18")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("prev-btn"));
    await waitFor(() => {
      expect(screen.getByText("Tue 17")).toBeInTheDocument();
    });
  });

  it("switches view mode from selector", async () => {
    const setMode = vi.fn();
    const { user } = renderCalendar({ mode: "week", setMode });

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /day/i }));

    expect(setMode).toHaveBeenCalledWith("day");
  });

  it("zooms grid with ctrl + mouse wheel", async () => {
    renderCalendar();

    const grid = document.querySelector(".grid") as HTMLDivElement | null;
    expect(grid).toBeTruthy();

    const initialRows = grid!.style.gridTemplateRows;

    act(() => {
      window.dispatchEvent(
        new WheelEvent("wheel", {
          ctrlKey: true,
          deltaY: -100,
          bubbles: true,
        }),
      );
    });

    await waitFor(() => {
      expect(grid!.style.gridTemplateRows).not.toEqual(initialRows);
    });
  });

  it("creates new event on correct day and time", async () => {
    const saveEvents = vi.fn();

    renderCalendar({ mode: "week", saveEvents });

    const cell = getDayCell(4);

    fireEvent.pointerDown(cell, {
      button: 0,
      pointerId: 7,
      pointerType: "mouse",
      clientX: dayCenterX(4),
      clientY: timeToClientY(11, 27),
    });

    dispatchWindowPointer("pointerup", {
      button: 0,
      pointerId: 7,
      pointerType: "mouse",
      clientX: dayCenterX(4),
      clientY: timeToClientY(11, 27),
    });

    expect(await screen.findByText("new event")).toBeInTheDocument();

    await advanceSave();

    const savedEvents = getLastSavedEvents(saveEvents);
    expect(savedEvents).toHaveLength(1);
    expect(savedEvents[0].title).toBe("new event");
    expect(savedEvents[0].start.toISO()).toBe(
      FIXED_NOW.startOf("week").plus({ days: 4, hours: 11, minutes: 25 }).toISO(),
    );
    expect(savedEvents[0].end.toISO()).toBe(
      FIXED_NOW.startOf("week").plus({ days: 4, hours: 12, minutes: 25 }).toISO(),
    );
  });

  it("edits event title and description with keyboard save", async () => {
    const saveEvents = vi.fn();
    const { user } = renderCalendar({
      events: [buildPlainEvent()],
      saveEvents,
    });

    await openEventEditor(user, "Planning");

    const titleInput = screen.getByDisplayValue("Planning");
    const descriptionInput = screen.getByDisplayValue("Sprint planning");

    await user.clear(titleInput);
    await user.type(titleInput, "Refined planning");
    await user.clear(descriptionInput);
    await user.type(descriptionInput, "Updated agenda");
    await user.keyboard("{Control>}s{/Control}");

    await advanceSave();

    expect(await screen.findByText("Refined planning")).toBeInTheDocument();

    const savedEvents = getLastSavedEvents(saveEvents);
    expect(savedEvents).toHaveLength(1);
    expect(savedEvents[0].title).toBe("Refined planning");
    expect(savedEvents[0].description).toBe("Updated agenda");
  });

  it("edits event start and end time", async () => {
    const saveEvents = vi.fn();
    const { user } = renderCalendar({
      events: [buildPlainEvent()],
      saveEvents,
    });

    await openEventEditor(user, "Planning");

    fireEvent.change(screen.getByDisplayValue("09:00"), {
      target: { value: "11:15" },
    });
    fireEvent.change(screen.getByDisplayValue("10:00"), {
      target: { value: "12:45" },
    });

    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await advanceSave();

    const savedEvents = getLastSavedEvents(saveEvents);
    expect(savedEvents[0].start.toISO()).toBe(
      FIXED_NOW.startOf("day").plus({ hours: 11, minutes: 15 }).toISO(),
    );
    expect(savedEvents[0].end.toISO()).toBe(
      FIXED_NOW.startOf("day").plus({ hours: 12, minutes: 45 }).toISO(),
    );
    expect(await screen.findByText("11:15 AM - 12:45 PM")).toBeInTheDocument();
  });

  it("cancels edit without saving changes", async () => {
    const saveEvents = vi.fn();
    const { user } = renderCalendar({
      events: [buildPlainEvent()],
      saveEvents,
    });

    await openEventEditor(user, "Planning");
    await advanceSave();
    saveEvents.mockClear();

    const titleInput = screen.getByDisplayValue("Planning");
    await user.clear(titleInput);
    await user.type(titleInput, "Discarded title");
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await advanceSave();

    expect(await screen.findByText("Planning")).toBeInTheDocument();
    expect(screen.queryByText("Discarded title")).not.toBeInTheDocument();
    expect(saveEvents).not.toHaveBeenCalled();
  });

  it("duplicates event from context menu", async () => {
    const saveEvents = vi.fn();
    const { user } = renderCalendar({
      events: [buildPlainEvent()],
      saveEvents,
    });

    await openEventMenu(user, "Planning");
    await user.click(await screen.findByRole("menuitem", { name: /duplicate/i }));

    await advanceSave();

    expect(countEventBlocks("Planning")).toBe(2);

    const savedEvents = getLastSavedEvents(saveEvents);
    expect(savedEvents).toHaveLength(2);
    expect(savedEvents.filter((event) => event.title === "Planning")).toHaveLength(2);
    expect(savedEvents[1].repeat).toBeUndefined();
  });

  it("deletes non-recurring event from context menu", async () => {
    const saveEvents = vi.fn();
    const { user } = renderCalendar({
      events: [buildPlainEvent()],
      saveEvents,
    });

    await openEventMenu(user, "Planning");
    await user.click(await screen.findByRole("menuitem", { name: /delete/i }));

    await advanceSave();

    expect(screen.queryByText("Planning")).not.toBeInTheDocument();
    expect(getLastSavedEvents(saveEvents)).toHaveLength(0);
  });

  it("moves event to another day", async () => {
    const saveEvents = vi.fn();

    renderCalendar({
      mode: "week",
      events: [buildPlainEvent()],
      saveEvents,
    });

    await dragEvent({
      title: "Planning",
      startX: dayCenterX(2),
      startY: timeToClientY(9),
      endX: dayCenterX(4),
      endY: timeToClientY(9),
    });
    await advanceSave();

    const savedEvents = getLastSavedEvents(saveEvents);
    expect(savedEvents[0].start.toISO()).toBe(
      FIXED_NOW.startOf("day").plus({ days: 2, hours: 9 }).toISO(),
    );
    expect(savedEvents[0].end.toISO()).toBe(
      FIXED_NOW.startOf("day").plus({ days: 2, hours: 10 }).toISO(),
    );
  });

  it("resizes event", async () => {
    const saveEvents = vi.fn();

    renderCalendar({
      mode: "week",
      events: [buildPlainEvent()],
      saveEvents,
    });

    await dragEvent({
      title: "Planning",
      source: "resize_end",
      startX: dayCenterX(2),
      startY: timeToClientY(10),
      endX: dayCenterX(2),
      endY: timeToClientY(11),
    });
    await advanceSave();

    const savedEvents = getLastSavedEvents(saveEvents);
    expect(savedEvents[0].start.toISO()).toBe(
      FIXED_NOW.startOf("day").plus({ hours: 9 }).toISO(),
    );
    expect(savedEvents[0].end.toISO()).toBe(
      FIXED_NOW.startOf("day").plus({ hours: 11 }).toISO(),
    );
  });

  it("updates only selected recurring instance", async () => {
    const saveEvents = vi.fn();
    const { user } = renderCalendar({
      events: [buildRecurringEvent()],
      saveEvents,
    });

    await openEventEditor(user, "Daily standup");

    const titleInput = screen.getByDisplayValue("Daily standup");
    await user.clear(titleInput);
    await user.type(titleInput, "One-off standup");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(
      await screen.findByText(/update recurring event/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^update$/i }));
    await advanceSave();

    expect(await screen.findByText("One-off standup")).toBeInTheDocument();
    expect(screen.queryByText("Daily standup")).not.toBeInTheDocument();

    const savedEvents = getLastSavedEvents(saveEvents);
    expect(savedEvents).toHaveLength(2);

    const parentEvent = savedEvents.find((event) => event.id === "repeat-parent");
    const detachedEvent = savedEvents.find((event) => event.id !== "repeat-parent");

    expect(parentEvent?.title).toBe("One-off standup");
    expect(parentEvent?.start.toISO()).toBe(
      FIXED_NOW.startOf("day").plus({ days: 1, hours: 8 }).toISO(),
    );
    expect(parentEvent?.repeat).toEqual({ interval: 1, unit: "day" });
    expect(detachedEvent?.title).toBe("One-off standup");
    expect(detachedEvent?.start.toISO()).toBe(
      FIXED_NOW.startOf("day").plus({ hours: 8 }).toISO(),
    );
    expect(detachedEvent?.repeat).toBeUndefined();
  });

  it("deletes one recurring instance", async () => {
    const saveEvents = vi.fn();
    const { user } = renderCalendar({
      events: [buildRecurringEvent()],
      saveEvents,
    });

    await openEventMenu(user, "Daily standup");
    await user.click(await screen.findByRole("menuitem", { name: /delete/i }));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await advanceSave();

    expect(screen.queryByText("Daily standup")).not.toBeInTheDocument();

    const savedEvents = getLastSavedEvents(saveEvents);
    expect(savedEvents).toHaveLength(1);
    expect(savedEvents[0].start.toISO()).toBe(
      FIXED_NOW.startOf("day").plus({ days: 1, hours: 8 }).toISO(),
    );
    expect(savedEvents[0].end.toISO()).toBe(
      FIXED_NOW.startOf("day").plus({ days: 1, hours: 9 }).toISO(),
    );
  });

  it("updates all recurring events", async () => {
    const saveEvents = vi.fn();
    const { user } = renderCalendar({
      mode: "week",
      events: [buildRecurringEvent()],
      saveEvents,
    });

    await openEventEditor(user, "Daily standup");

    const titleInput = screen.getByDisplayValue("Daily standup");
    await user.clear(titleInput);
    await user.type(titleInput, "Team standup");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(
      await screen.findByText(/update recurring event/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /all events/i }));
    await user.click(screen.getByRole("button", { name: /^update$/i }));
    await advanceSave();

    expect(screen.queryByText("Daily standup")).not.toBeInTheDocument();
    expect((await screen.findAllByText("Team standup")).length).toBeGreaterThan(1);

    const savedEvents = getLastSavedEvents(saveEvents);
    expect(savedEvents).toHaveLength(1);
    expect(savedEvents[0].title).toBe("Team standup");
  });

  it("deletes all recurring events from dialog", async () => {
    const saveEvents = vi.fn();
    const { user } = renderCalendar({
      events: [buildRecurringEvent()],
      saveEvents,
    });

    await openEventMenu(user, "Daily standup");
    await user.click(await screen.findByRole("menuitem", { name: /delete/i }));

    expect(
      await screen.findByText(/delete recurring event/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /all events/i }));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await advanceSave();

    expect(screen.queryByText("Daily standup")).not.toBeInTheDocument();
    expect(getLastSavedEvents(saveEvents)).toHaveLength(0);
  });

  it("shows same event date and time in day and week views", async () => {
    const timedEvent = buildEvent({
      title: "Review",
      start: FIXED_NOW.startOf("day").plus({ hours: 14, minutes: 30 }),
      end: FIXED_NOW.startOf("day").plus({ hours: 16 }),
    });

    const dayRender = renderCalendar({
      mode: "day",
      events: [timedEvent],
    });

    const dayBlock = await getEventBlock("Review");
    expect(screen.getByText("Wed 18")).toBeInTheDocument();
    expect(dayBlock).toHaveTextContent("2:30 - 4 PM");

    dayRender.unmount();

    renderCalendar({
      mode: "week",
      events: [timedEvent],
    });

    const weekBlock = await getEventBlock("Review");
    expect(screen.getByText("Wed 18")).toBeInTheDocument();
    expect(weekBlock).toHaveTextContent("2:30 - 4 PM");
  });
});

import type { ComponentType, ReactNode } from "react";
import { toast } from "sonner";
import { MoveIcon } from "lucide-react";
import type { CalendarEvent } from "@/types/calendar/Event";
import { useCalendar } from "@/context/CalendarContext";
import {
  getMovedEvent,
  findFreeSlotForEvent,
  MOVE_MINUTE_STEPS,
  MOVE_HOUR_STEPS,
  MOVE_UNIT_STEPS,
} from "@/lib/calendar/moveHelpers";

/* shared shape between shadcn's DropdownMenu* and ContextMenu* primitives,
   so this menu can be rendered inside either one without duplicating markup */
export type MoveMenuKit = {
  Sub: ComponentType<{ children?: ReactNode }>;
  SubTrigger: ComponentType<{ children?: ReactNode; className?: string }>;
  SubContent: ComponentType<{ children?: ReactNode }>;
  Item: ComponentType<{ children?: ReactNode; onClick?: () => void }>;
  Separator: ComponentType;
};

export function MoveMenuItems({
  event,
  onMove,
  menu,
}: {
  event: CalendarEvent;
  onMove: (originalEvent: CalendarEvent, event: CalendarEvent) => void;
  menu: MoveMenuKit;
}) {
  const { calendarEvents } = useCalendar();
  const { Sub, SubTrigger, SubContent, Item, Separator } = menu;

  const moveBy = (
    direction: "forward" | "backward",
    unit: "minutes" | "hours" | "days" | "weeks" | "months" | "years",
    amount: number,
  ) => {
    onMove(event, getMovedEvent(event, direction, unit, amount));
  };

  const moveToFreeSlot = (direction: "forward" | "backward") => {
    const slot = findFreeSlotForEvent(calendarEvents, event, direction);
    if (!slot) return toast.error("No free slot found");

    onMove(event, { ...event, start: slot.start, end: slot.end });

    const sameDay = slot.start.hasSame(slot.end, "day");
    toast.success(
      `Moved to ${slot.start.toFormat("EEE, MMM d, h:mm a")} - ${slot.end.toFormat(sameDay ? "h:mm a" : "EEE, MMM d, h:mm a")}`,
    );
  };

  return (
    <Sub>
      <SubTrigger className="gap-2">
        <MoveIcon />
        Move...
      </SubTrigger>
      <SubContent>
        <Sub>
          <SubTrigger>Forward...</SubTrigger>
          <SubContent>
            {MOVE_MINUTE_STEPS.map((minutes) => (
              <Item
                key={`fwd-min-${minutes}`}
                onClick={() => moveBy("forward", "minutes", minutes)}
              >
                {minutes} minutes
              </Item>
            ))}
            {MOVE_HOUR_STEPS.map((hours) => (
              <Item
                key={`fwd-hour-${hours}`}
                onClick={() => moveBy("forward", "hours", hours)}
              >
                {hours} hour{hours > 1 ? "s" : ""}
              </Item>
            ))}
          </SubContent>
        </Sub>

        <Sub>
          <SubTrigger>Backward...</SubTrigger>
          <SubContent>
            {MOVE_MINUTE_STEPS.map((minutes) => (
              <Item
                key={`bwd-min-${minutes}`}
                onClick={() => moveBy("backward", "minutes", minutes)}
              >
                {minutes} minutes
              </Item>
            ))}
            {MOVE_HOUR_STEPS.map((hours) => (
              <Item
                key={`bwd-hour-${hours}`}
                onClick={() => moveBy("backward", "hours", hours)}
              >
                {hours} hour{hours > 1 ? "s" : ""}
              </Item>
            ))}
          </SubContent>
        </Sub>

        <Sub>
          <SubTrigger>Next...</SubTrigger>
          <SubContent>
            {MOVE_UNIT_STEPS.map(({ label, unit }) => (
              <Item key={`next-${unit}`} onClick={() => moveBy("forward", unit, 1)}>
                {label}
              </Item>
            ))}
          </SubContent>
        </Sub>

        <Sub>
          <SubTrigger>Previous...</SubTrigger>
          <SubContent>
            {MOVE_UNIT_STEPS.map(({ label, unit }) => (
              <Item key={`prev-${unit}`} onClick={() => moveBy("backward", unit, 1)}>
                {label}
              </Item>
            ))}
          </SubContent>
        </Sub>

        <Separator />

        <Item onClick={() => moveToFreeSlot("forward")}>Next free slot</Item>
        <Item onClick={() => moveToFreeSlot("backward")}>Previous free slot</Item>
      </SubContent>
    </Sub>
  );
}

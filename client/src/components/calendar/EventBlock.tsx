import { isColorDark, shallowEqual } from "@/lib/utils";
import type { EventBlockProps } from "@/types/Props";
import { useRef, memo, useMemo, useCallback, useEffect, useState } from "react";
import EventEditor from "./EventEditor";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "../ui/context-menu";
import {
  Clipboard,
  CopyIcon,
  MoveIcon,
  PencilLine,
  RedoDot,
  Trash2,
} from "lucide-react";
import useTapInteraction from "@/hooks/useTapInteraction";
import { useCalendar } from "@/context/CalendarContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { findFreeSlot } from "@/lib/calendar/freeSpace";
import { toast } from "sonner";

// how long (ms) a touch must be held roughly still before it starts a drag
const LONG_PRESS_MS = 450;
// how far (px) a touch may move during the hold before it's treated as a scroll/tap instead
const LONG_PRESS_TOLERANCE = 10;

const MOVE_MINUTE_STEPS = [5, 10, 15, 30];
const MOVE_HOUR_STEPS = [1, 2, 3, 4, 5, 8];
const MOVE_UNIT_STEPS: { label: string; unit: "days" | "weeks" | "months" | "years" }[] = [
  { label: "Day", unit: "days" },
  { label: "Week", unit: "weeks" },
  { label: "Month", unit: "months" },
  { label: "Year", unit: "years" },
];

export default memo(
  function EventBlock({
    event,
    day,
    date,
    style,
    editing,
    onPointerDown,
    onEventEdit,
    onEventDelete,
    onDuplicate,
  }: EventBlockProps) {
    const { setEditingEvent, calendarEvents } = useCalendar();
    const isMobile = useIsMobile();

    const { startsToday, endsToday } = useMemo(
      () => ({
        startsToday: event.start.day === date.day,
        endsToday: event.end.day === date.day,
      }),
      [event.start, event.end, date],
    );

    const { eventColor, textColor, startTimeFormat, endTimeFormat } =
      useMemo(() => {
        const color = event.color ?? "#2563eb";
        const isDark = isColorDark(color);
        const sameMeridiem =
          event.start.toFormat("a") === event.end.toFormat("a");
        return {
          eventColor: color,
          textColor: isDark ? "text-white" : "text-black",
          startTimeFormat:
            (event.start.minute === 0 ? "h" : "h:mm") +
            (!sameMeridiem || !endsToday ? " a" : ""),
          endTimeFormat:
            (event.end.minute === 0 ? "h a" : "h:mm a") +
            (endsToday ? "" : " (EEE)"),
        };
      }, [event.start, event.end, event.color, endsToday]);

    const blockStyle = useMemo(
      () => ({
        top: style.top,
        left: style.left + "%",
        // stop mobile browsers from popping up their own text-selection/
        // context-menu callout on the long-press used for hold-to-drag
        WebkitTouchCallout: "none" as const,
        WebkitUserSelect: "none" as const,
        // touch-action must be set statically (not toggled once the drag
        // starts) for browsers to reliably honor it instead of scrolling;
        // scrolling can still be done by starting the touch on empty grid
        touchAction: "none" as const,
        height: style.height,
        width: style.width + "%",
        backgroundColor: eventColor,
      }),
      [style.top, style.left, style.height, style.width, eventColor],
    );

    const eventRef = useRef<HTMLDivElement>(null);
    const lineHeight = 16;
    const padding = style.height > lineHeight * 3 ? "p-1" : "p-[1px]"; // TODO: maybe make it smarter in the future
    const lineClamp = useMemo(
      () => Math.ceil(style.height / lineHeight) - 2,
      [style.height],
    );
    const timeLabel = useMemo(
      () =>
        `${event.start.toFormat(startTimeFormat)} - ${event.end.toFormat(endTimeFormat)}`,
      [event.start, event.end, startTimeFormat, endTimeFormat],
    );

    const copyID = useCallback(() => {
      navigator.clipboard.writeText(event._parent || event.id);
    }, [event.id, event._parent]);

    const { handlers: tapHandlers } = useTapInteraction({
      onTap: () => setTimeout(() => setEditingEvent(event), 50),
    });

    const handleDelete = useCallback(() => {
      onEventDelete(event);
    }, [onEventDelete, event]);

    const preventTouch = useCallback((e: React.PointerEvent) => {
      if (e.pointerType === "touch") e.preventDefault();
    }, []);

    // hold-to-drag support for touch screens: a touch must be held roughly
    // still for LONG_PRESS_MS before it's treated as the start of a drag,
    // otherwise it's left alone so tapping/scrolling keeps working normally
    const [isHeld, setIsHeld] = useState(false);
    const longPressRef = useRef<{
      timer: number;
      x: number;
      y: number;
      pointerId: number;
      activated: boolean;
    } | null>(null);

    const cancelLongPress = useCallback(() => {
      if (longPressRef.current) {
        window.clearTimeout(longPressRef.current.timer);
        longPressRef.current = null;
      }
      setIsHeld(false);
    }, []);

    useEffect(() => cancelLongPress, [cancelLongPress]);

    const handleTouchPointerDown = useCallback(
      (e: React.PointerEvent) => {
        tapHandlers.onPointerDown(e);

        const timer = window.setTimeout(() => {
          const state = longPressRef.current;
          if (!state) return;
          state.activated = true;
          setIsHeld(true);
          navigator.vibrate?.(15);
          onPointerDown(e, "move", event, day);
        }, LONG_PRESS_MS);

        longPressRef.current = {
          timer,
          x: e.clientX,
          y: e.clientY,
          pointerId: e.pointerId,
          activated: false,
        };
      },
      [tapHandlers, onPointerDown, event, day],
    );

    const handleTouchPointerMove = useCallback(
      (e: React.PointerEvent) => {
        tapHandlers.onPointerMove(e);

        const state = longPressRef.current;
        if (!state || state.activated || state.pointerId !== e.pointerId)
          return;

        // moved too far before the hold finished, treat this as a scroll/tap
        if (
          Math.abs(e.clientX - state.x) > LONG_PRESS_TOLERANCE ||
          Math.abs(e.clientY - state.y) > LONG_PRESS_TOLERANCE
        ) {
          cancelLongPress();
        }
      },
      [tapHandlers, cancelLongPress],
    );

    const handleTouchPointerUp = useCallback(
      (e: React.PointerEvent) => {
        // if the drag never activated, this was a normal tap release
        if (!longPressRef.current?.activated) tapHandlers.onPointerUp(e);
        cancelLongPress();
      },
      [tapHandlers, cancelLongPress],
    );

    const handleTouchPointerCancel = useCallback(
      (e: React.PointerEvent) => {
        tapHandlers.onPointerCancel(e);
        cancelLongPress();
      },
      [tapHandlers, cancelLongPress],
    );

    const stopPropagation = useCallback((e: React.PointerEvent) => {
      e.stopPropagation();
    }, []);

    const duplicate = useCallback(() => {
      onDuplicate(event);
    }, [event, onDuplicate]);

    const moveEvent = useCallback(
      (
        direction: "forward" | "backward",
        unit: "minutes" | "hours" | "days" | "weeks" | "months" | "years",
        amount: number,
      ) => {
        const delta = direction === "forward" ? amount : -amount;
        const newEvent = {
          ...event,
          start: event.start.plus({ [unit]: delta }),
          end: event.end.plus({ [unit]: delta }),
        };
        onEventEdit(event, newEvent);
      },
      [event, onEventEdit],
    );

    const moveToFreeSpace = useCallback(
      (direction: "forward" | "backward") => {
        const slot = findFreeSlot(calendarEvents, event, direction);

        if (!slot) {
          toast.error("No free slot found");
          return;
        }

        onEventEdit(event, { ...event, start: slot.start, end: slot.end });

        const sameDay = slot.start.hasSame(slot.end, "day");
        toast.success(
          `Moved to ${slot.start.toFormat("EEE, MMM d, h:mm a")} - ${slot.end.toFormat(sameDay ? "h:mm a" : "EEE, MMM d, h:mm a")}`,
        );
      },
      [event, calendarEvents, onEventEdit],
    );

    return (
      <>
        <ContextMenu>
          {/* long-press-to-open conflicts with hold-to-drag on touch, so the
              context menu is only available on mobile via the "..." button
              inside the event editor */}
          <ContextMenuTrigger onPointerDown={preventTouch} disabled={isMobile}>
            {/* visible event block */}
            <div
              className={`pointer-events-auto event-block ${padding} absolute left-0 right-0 z-10 text-xs ${textColor} cursor-pointer select-none overflow-hidden shadow-[inset_0_0_2px_rgba(0,0,0,0.35)] ${isHeld ? "scale-[1.03] shadow-lg ring-2 ring-white/80 z-30" : ""} transition-transform`}
              style={blockStyle}
              onPointerDown={useCallback(
                (e: React.PointerEvent) => {
                  if (e.pointerType === "touch") handleTouchPointerDown(e);
                  else onPointerDown(e, "move", event, day);
                },
                [handleTouchPointerDown, day, event, onPointerDown],
              )}
              onPointerMove={handleTouchPointerMove}
              onPointerUp={handleTouchPointerUp}
              onPointerCancel={handleTouchPointerCancel}
              onContextMenu={(e) => {
                if (isMobile) e.preventDefault();
              }}
              onDoubleClick={() => setEditingEvent(event)}
              ref={eventRef}
            >
              {!event._continued ? (
                <>
                  <div
                    className="font-semibold"
                    style={{
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: lineClamp,
                      overflow: "hidden",
                    }}
                  >
                    {event.title}
                  </div>
                  <span className="text-xs block">{timeLabel}</span>
                </>
              ) : (
                <div className="flex justify-end">
                  <RedoDot size={16} />
                </div>
              )}

              {/* handles for resizing */}
              {startsToday && (
                <div
                  className="hidden md:block absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-background/20"
                  onPointerDown={(e) =>
                    onPointerDown(e, "resize_start", event, day)
                  }
                />
              )}
              {endsToday && (
                <div
                  className="hidden md:block absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-background/20"
                  onPointerDown={(e) =>
                    onPointerDown(e, "resize_end", event, day)
                  }
                />
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent onPointerDown={stopPropagation}>
            {/* context menu items */}
            <ContextMenuLabel>{event.title}</ContextMenuLabel>

            <ContextMenuItem onClick={() => setEditingEvent(event)}>
              <PencilLine />
              Edit
            </ContextMenuItem>

            <ContextMenuItem onClick={copyID}>
              <Clipboard />
              {event._parent ? "Copy parent ID" : "Copy ID"}
            </ContextMenuItem>

            <ContextMenuItem onClick={duplicate}>
              <CopyIcon />
              Duplicate
            </ContextMenuItem>

            <ContextMenuSub>
              <ContextMenuSubTrigger className="gap-2">
                <MoveIcon />
                Move...
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>Forward...</ContextMenuSubTrigger>
                  <ContextMenuSubContent>
                    {MOVE_MINUTE_STEPS.map((minutes) => (
                      <ContextMenuItem
                        key={`fwd-min-${minutes}`}
                        onClick={() => moveEvent("forward", "minutes", minutes)}
                      >
                        {minutes} minutes
                      </ContextMenuItem>
                    ))}
                    {MOVE_HOUR_STEPS.map((hours) => (
                      <ContextMenuItem
                        key={`fwd-hour-${hours}`}
                        onClick={() => moveEvent("forward", "hours", hours)}
                      >
                        {hours} hour{hours > 1 ? "s" : ""}
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>

                <ContextMenuSub>
                  <ContextMenuSubTrigger>Backward...</ContextMenuSubTrigger>
                  <ContextMenuSubContent>
                    {MOVE_MINUTE_STEPS.map((minutes) => (
                      <ContextMenuItem
                        key={`bwd-min-${minutes}`}
                        onClick={() => moveEvent("backward", "minutes", minutes)}
                      >
                        {minutes} minutes
                      </ContextMenuItem>
                    ))}
                    {MOVE_HOUR_STEPS.map((hours) => (
                      <ContextMenuItem
                        key={`bwd-hour-${hours}`}
                        onClick={() => moveEvent("backward", "hours", hours)}
                      >
                        {hours} hour{hours > 1 ? "s" : ""}
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>

                <ContextMenuSub>
                  <ContextMenuSubTrigger>Next...</ContextMenuSubTrigger>
                  <ContextMenuSubContent>
                    {MOVE_UNIT_STEPS.map(({ label, unit }) => (
                      <ContextMenuItem
                        key={`next-${unit}`}
                        onClick={() => moveEvent("forward", unit, 1)}
                      >
                        {label}
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>

                <ContextMenuSub>
                  <ContextMenuSubTrigger>Previous...</ContextMenuSubTrigger>
                  <ContextMenuSubContent>
                    {MOVE_UNIT_STEPS.map(({ label, unit }) => (
                      <ContextMenuItem
                        key={`prev-${unit}`}
                        onClick={() => moveEvent("backward", unit, 1)}
                      >
                        {label}
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>

                <ContextMenuSeparator />

                <ContextMenuItem onClick={() => moveToFreeSpace("forward")}>
                  Next free slot
                </ContextMenuItem>

                <ContextMenuItem onClick={() => moveToFreeSpace("backward")}>
                  Previous free slot
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuItem onClick={handleDelete}>
              <Trash2 /> Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        {/* edit overlay */}
        {editing && !event._continued && (
          <EventEditor
            event={event}
            eventRef={eventRef}
            onSave={(originalEvent, newEvent) => {
              onEventEdit(originalEvent, newEvent);
              setEditingEvent(null);
            }}
            onDelete={handleDelete}
            onDuplicate={duplicate}
            onCancel={() => setEditingEvent(null)}
          />
        )}
      </>
    );
  },
  (prev, next) => {
    return (
      prev.event === next.event &&
      prev.day === next.day &&
      prev.editing === next.editing &&
      shallowEqual(prev.style, next.style)
    );
  },
);

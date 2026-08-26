import type { DateTime } from "luxon";
import type { Dispatch } from "react";
import type { CalendarEvent, EventChange } from "@/types/calendar/Event";
import type { CalendarAction } from "@/types/calendar/Action";

export function detachSingleOccurrence(
  event: CalendarEvent,
  originalStart: DateTime,
  originalEnd: DateTime,
  calendarEvents: CalendarEvent[],
  dispatch: Dispatch<CalendarAction>,
  updateChange: (change: EventChange) => void,
) {
  const isParent = !event._parent && !!event.repeat;
  const parentId = isParent ? event.id : event._parent;

  const originalParent = calendarEvents.find((e) => e.id === parentId);

  if (!originalParent?.repeat) {
    dispatch({ type: "update", id: event.id, data: event });
    updateChange({ type: "updated", event });
    return;
  }

  const newEvent = {
    ...event,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  } as CalendarEvent;

  const parent = { ...originalParent };

  if (isParent) {
    // move parent to its next occurrence, skipping excluded weekdays/dates
    const interval = { [parent.repeat!.unit]: parent.repeat!.interval };
    const skip = new Set(parent.repeat!.skip);
    const except = new Set(parent.repeat!.except);
    let nextStart = originalStart.plus(interval);
    let nextEnd = originalEnd.plus(interval);
    while (
      skip.has(nextStart.toUTC().toISODate()!) ||
      except.has(nextStart.toUTC().weekday)
    ) {
      nextStart = nextStart.plus(interval);
      nextEnd = nextEnd.plus(interval);
    }
    parent.start = nextStart;
    parent.end = nextEnd;
  } else {
    // skip this occurrence on the parent
    parent.repeat = {
      ...parent.repeat!,
      skip: [
        ...(parent.repeat!.skip ?? []),
        originalStart.toUTC().toISODate()!,
      ],
    };
  }

  updateChange({ type: "updated", event: parent });
  dispatch({ type: "update", id: parent.id, data: parent });

  delete newEvent._parent; // detach from parent
  delete newEvent.repeat; // don't repeat

  dispatch({ type: "add", event: newEvent });
  updateChange({ type: "added", event: newEvent });
}

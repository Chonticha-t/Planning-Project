/// <reference types="vite/client" />
import type React from "react";

interface CallyCalendarDateProps extends React.HTMLAttributes<HTMLElement> {
  value?: string;
  min?: string;
  max?: string;
  today?: string;
  months?: number;
  locale?: string;
  focusedDate?: string;
  firstDayOfWeek?: number;
  showOutsideDays?: boolean;
  showWeekNumbers?: boolean;
  ref?: React.Ref<HTMLElement>;
}

interface CallyCalendarMonthProps extends React.HTMLAttributes<HTMLElement> {
  offset?: number;
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "calendar-date": CallyCalendarDateProps;
      "calendar-month": CallyCalendarMonthProps;
      "calendar-range": CallyCalendarDateProps;
      "calendar-multi": CallyCalendarDateProps;
    }
  }
}


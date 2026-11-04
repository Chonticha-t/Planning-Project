import { useEffect, useState } from "react";
import dayjs from "dayjs";

export const useGateToday = () => {
  const [today, setToday] = useState(() => dayjs().format("YYYY-MM-DD"));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      const now = dayjs();
      setToday(now.format("YYYY-MM-DD"));
      const delay = now.add(1, "day").startOf("day").diff(now) + 100;
      timer = setTimeout(update, delay);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") update();
    };
    update();
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return today;
};

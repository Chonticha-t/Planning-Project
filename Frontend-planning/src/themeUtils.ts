import { oklch, formatHex } from "culori";

const colorVariables = [
    "primary",
    "primary-content",
    "secondary",
    "secondary-content",
    "accent",
    "accent-content",
    "neutral",
    "neutral-content",
    "base-100",
    "base-200",
    "base-300",
    "base-content",
    "info",
    "info-content",
    "success",
    "success-content",
    "warning",
    "warning-content",
    "error",
    "error-content",
];

const oklchToHex = (oklchColor: string) => {
    try {
        const rgb = oklch(oklchColor);
        return formatHex(rgb);
    } catch {
        return null;
    }
};

export const getThemeColors = () => {
    const style = getComputedStyle(document.documentElement);
    return colorVariables.reduce((colors: any, key: any) => {
        const oklchValue = style.getPropertyValue(`--color-${key}`).trim();
        colors[key] = oklchValue ? oklchToHex(oklchValue) : null;
        return colors;
    }, {});
};

export const observeThemeChanges = (callback = () => { }) => {
    const observer = new MutationObserver(callback);
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
    });
    return observer;
};

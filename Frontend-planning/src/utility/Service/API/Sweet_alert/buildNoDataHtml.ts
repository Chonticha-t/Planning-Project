// buildNoDataHtml.ts
export const buildNoDataHtmlDev = (opts: {
  subtitle?: string;
  endpoint?: string;
  method?: string;
  params?: any;
  tips?: string[];
}) => {
  const { subtitle, endpoint, method, params, tips = [] } = opts || {};
  const prettyParams = params ? JSON.stringify(params, null, 2) : "{}";
  const tipsList = tips.length
    ? `<ul class="list-disc pl-5 space-y-1">${tips
      .map((t) => `<li>${t}</li>`)
      .join("")}</ul>`
    : "";

  return `
    <div class="text-left space-y-3">
      ${subtitle ? `<p class="opacity-80 text-center">${subtitle}</p>` : ""}

      <div class="rounded-xl border border-base-300 bg-base-100 p-3">
        <div class="text-xs opacity-60 mb-1">Endpoint</div>
        <div class="text-sm font-medium break-all">${method ?? "GET"} ${endpoint ?? "-"
    }</div>
      </div>

      <details class="rounded-xl border border-base-300 bg-base-100 p-3">
        <summary class="cursor-pointer text-sm font-medium">Query Params</summary>
        <pre class="mt-2 text-xs bg-base-200 p-2 rounded overflow-auto max-h-48">${prettyParams}</pre>
      </details>

      ${tipsList
      ? `<div class="rounded-xl border border-warning/30 bg-warning/10 p-3">
              <div class="text-xs opacity-60 mb-1">คำแนะนำ</div>
              ${tipsList}
            </div>`
      : ""
    }
    </div>
  `;
};

export const buildNoDataHtmlPRD = (opts: {
  subtitle?: string;
  endpoint?: string;
  method?: string;
  params?: any;
  tips?: string[];
}) => {
  const { subtitle, endpoint, method, params, tips = [] } = opts || {};
  const prettyParams = params ? JSON.stringify(params, null, 2) : "{}";
  const tipsList = tips.length
    ? `<ul class="list-disc pl-5 space-y-1">${tips
      .map((t) => `<li>${t}</li>`)
      .join("")}</ul>`
    : "";

  return `
    <div class="text-left space-y-3">
      ${subtitle ? `<p class="opacity-80 text-center">${subtitle}</p>` : ""}


      ${tipsList
      ? `<div class="rounded-xl border border-warning/30 bg-warning/10 p-3">
              <div class="text-xs opacity-60 mb-1">คำแนะนำ</div>
              ${tipsList}
            </div>`
      : ""
    }
    </div>
  `;
};
